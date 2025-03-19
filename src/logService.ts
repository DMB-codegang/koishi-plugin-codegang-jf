import { Context, Logger, $ } from 'koishi'
import { Config } from './config'
export * from './config'

const database_name_log = 'codegang_jf_log';

export class LogService {
  private ctx: Context
  private cfg: Config
  private log: Logger

  constructor(ctx: Context, cfg: Config) {
    this.ctx = ctx
    this.cfg = cfg
    this.log = new Logger("@codegang/codegang-jf");
    ctx.model.extend(database_name_log, {
      id: 'unsigned',
      userid: 'string',
      operationType: 'string',
      newValue: 'integer',
      plugin: 'string',
      comment: 'string',
      statusCode: 'integer',
      time: 'timestamp',
      oldValue: 'integer',
      transactionId: 'string'
    }, { primary: 'id' })
  }
  private shouldSkipLog(logData: { operationType: string; statusCode: number }): boolean {
    return !this.checkTypeAllowed(logData.operationType) || !this.checkSuccessFilter(logData.statusCode);
  }

  private checkTypeAllowed(operationType: string): boolean {
    return this.cfg.log_type.includes(operationType);
  }

  private checkSuccessFilter(statusCode: number): boolean {
    return this.cfg.only_success_false
      ? !(statusCode >= 200 && statusCode < 300)  // 取反判断条件
      : true;
  }

  private createLogData(id: number | null, logData: any) {
    return {
      id,
      userid: logData.userid,
      operationType: logData.operationType,
      newValue: logData.newValue,
      plugin: logData.plugin,
      statusCode: logData.statusCode,
      comment: logData.comment,
      oldValue: logData.oldValue ?? 0,
      transactionId: logData.transactionId,
      time: new Date()
    };
  }

  private async findGapId(): Promise<number> {
    const existingIds = (await this.ctx.database.select(database_name_log)
      .orderBy('id', 'asc')
      .execute(row => $.array(row.id))).map(Number);

    let gap = 0;
    for (const id of existingIds) {
      if (id > gap) break;
      gap = id + 1;
    }
    return gap;
  }

  /**
   * 写入日志记录（主入口方法）
   * @param logData 日志数据对象，包含以下字段：
   *  - userid: 用户标识符
   *  - operationType: 操作类型
   *  - newValue: 新数值（可选）
   *  - oldValue: 旧数值（可选）
   *  - comment: 附加说明（可选）
   *  - statusCode: 操作状态码（必填）
   *  - plugin: 来源插件名称（可选，默认'unknown'）
   * 
   * 方法逻辑：
   * 1. 检查日志功能是否启用
   * 2. 设置默认值并应用过滤规则
   * 3. 处理空数据库初始化场景
   * 4. 根据当前记录数选择插入策略：
   *    - 未达上限：直接创建新记录
   *    - 超过上限：复用ID间隙或覆盖最旧记录
   * 5. 自动清理超出max_log配置的旧记录
   * 
   * @throws 操作失败时记录错误信息到Logger
   */
  async writelog(logData: {
    userid: string
    operationType: string
    newValue?: number
    comment?: string
    statusCode: number
    plugin?: string
    oldValue?: number
    transactionId?: string
  }) {
    if (!this.cfg.log_enabled) return;
    logData.plugin ??= 'unknown';
    logData.newValue ??= 0;
    logData.comment??= '';

    if (this.shouldSkipLog(logData)) return;

    try {
      const gap = await this.findGapId();
      const datacount = await this.getLogCount();

      if (datacount === 0) {
        await this.createInitialLog(logData);
        return;
      }

      const [maxId, newestId, oldestId] = await Promise.all([
        this.getMaxId(),
        this.getNewestId(),
        this.getOldestId()
      ]);

      datacount < this.cfg.max_log
        ? await this.handleUnderMax(logData)
        : await this.handleOverMax(logData, gap, oldestId, datacount);
    } catch (error) {
      this.log.error(`写入日志失败：${error.message}`);
    }
  }

  private async getLogCount(): Promise<number> {
    return (await this.ctx.database.stats()).tables[database_name_log].count;
  }

  /**
   * 创建初始日志记录（当数据库为空时调用）
   * @param logData 要记录的初始日志数据
   */
  private async createInitialLog(logData: any) {
    await this.ctx.database.create(database_name_log,
      this.createLogData(null, logData));
  }

  /**
   * 处理未超过最大记录数的情况
   * @param logData 要记录的日志数据
   */
  private async handleUnderMax(logData: any) {
    await this.ctx.database.create(database_name_log,
      this.createLogData(null, logData));
  }

  /**
   * 处理超过最大记录数的情况
   * @param logData 要记录的日志数据
   * @param gap 找到的ID间隙
   * @param oldestId 最旧记录的ID
   * @param datacount 当前总记录数
   */
  private async handleOverMax(logData: any, gap: number, oldestId: number, datacount: number) {
    const useGap = gap <= this.cfg.max_log;
    await this.ctx.database.upsert(database_name_log, [
      this.createLogData(useGap ? gap : oldestId, logData)
    ]);

    if (datacount > this.cfg.max_log) {
      await this.cleanupOldLogs(datacount);
    }
  }

  /**
   * 清理过期日志记录
   * @param datacount 当前总记录数
   */
  private async cleanupOldLogs(datacount: number) {
    const deleteCount = datacount - this.cfg.max_log;
    const rows = await this.ctx.database.get(database_name_log, {}, {
      fields: ['id'],
      sort: { time: 'asc' },
      limit: deleteCount
    });
    await this.ctx.database.remove(database_name_log, {
      id: rows.map(row => row.id)
    });
  }

  // 获取最大ID值
  private async getMaxId(): Promise<number> {
    const results = await this.ctx.database.select(database_name_log)
      .orderBy('id', 'desc').limit(1).execute()
    return results[0]?.id ?? 0
  }

  // 获取最新记录的ID
  private async getNewestId(): Promise<number> {
    const results = await this.ctx.database.select(database_name_log)
      .orderBy('time', 'desc').limit(1).execute()
    return results[0]?.id ?? 0
  }

  // 获取最旧记录的ID
  private async getOldestId(): Promise<number> {
    const results = await this.ctx.database.select(database_name_log)
      .orderBy('time', 'asc').limit(1).execute()
    return results[0]?.id ?? 0
  }
}