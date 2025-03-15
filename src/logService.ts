import { Context, Logger, $ } from 'koishi'

const database_name_log = 'codegang_jf_log';

export class LogService {
    private ctx: Context
    private log: Logger
  
    constructor(ctx: Context) {
      this.ctx = ctx
      this.log = new Logger("@codegang/codegang-jf");
      ctx.model.extend(database_name_log, {
        id: 'unsigned',
        userid: 'string',
        operationType: 'string',
        operationNum: 'integer',
        plugin: 'string',
        comment: 'string',
        success: 'boolean',
        time: 'timestamp'
      }, { primary: 'id' })
    }

    async writelog(logData: {
        userid: string
        operationType: string
        operationNum?: number
        comment?: string
        success: boolean
        plugin?: string
      }) {
        // 如果日志功能未启用，直接返回
        if (!this.ctx.config.log) return
        logData.plugin ??= 'unknown'
        logData.operationNum ??= null
    
        // 检查日志类型是否在允许列表中
        const typeAllowed = this.ctx.config.log_type.includes(logData.operationType)
        // 
        const successFilter = this.ctx.config.only_success_false ? !logData.success : true
        // 如果日志类型不允许或不满足成功状态过滤条件，则不记录
        if (!typeAllowed || !successFilter) return
        try {
          const existingIds = (await this.ctx.database.select(database_name_log)
            .orderBy('id', 'asc')
            .execute(row => $.array(row.id))).map(Number)
          let gap = 0;
          for (const id of existingIds) {
            if (id > gap) break;  // 发现间隙，直接退出
            gap = id + 1;          // 连续时更新 gap
          }
          const datacount: number = (await this.ctx.database.stats()).tables[database_name_log].count // 获取日志数量
          if (datacount === 0) {
            await this.ctx.database.create(database_name_log, {
              userid: logData.userid,
              operationType: logData.operationType,
              operationNum: logData.operationNum,
              plugin: logData.plugin,
              success: logData.success,
              time: new Date()
            })
            return
          }
          const maxId: number = (await this.ctx.database.select(database_name_log).orderBy('id', 'desc').limit(1).execute())[0].id
          const newestId: number = (await this.ctx.database.select(database_name_log).orderBy('time', 'desc').limit(1).execute())[0].id
          const oldestId: number = (await this.ctx.database.select(database_name_log).orderBy('time', 'asc').limit(1).execute())[0].id
          switch (true) {
            case datacount < this.ctx.config.max_log:
              // 如果日志数量为0或小于配置项的最大值，说明分配的空间还未填满，则直接创建新日志
              this.ctx.database.create(database_name_log, {
                userid: logData.userid,
                operationType: logData.operationType,
                operationNum: logData.operationNum,
                plugin: logData.plugin,
                success: logData.success,
                time: new Date()
              })
              break;
            case newestId >= this.ctx.config.max_log || maxId >= this.ctx.config.max_log:
              // 如果最新的日志ID大于等于配置项的最大值，或者最大ID大于等于配置项的最大值，则说明分配的空间已满，需要进行循环
              if (gap <= this.ctx.config.max_log) {// 有空id位优先使用空id位
                this.ctx.database.upsert(database_name_log, [
                  {
                    id: gap,
                    userid: logData.userid,
                    operationType: logData.operationType,
                    operationNum: logData.operationNum,
                    plugin: logData.plugin,
                    success: logData.success,
                    time: new Date()
                  }
                ])
              } else {
                this.ctx.database.upsert(database_name_log, [
                  {
                    id: oldestId,
                    userid: logData.userid,
                    operationType: logData.operationType,
                    operationNum: logData.operationNum,
                    plugin: logData.plugin,
                    success: logData.success,
                    time: new Date()
                  }
                ])
              }
              if (datacount > this.ctx.config.max_log) {
                // 通过配置文件的最大日志数和数据库中的日志数，计算出需要删除的日志数量
                const deleteCount = datacount - this.ctx.config.max_log
                const row = await this.ctx.database.get(database_name_log, {}, {
                  fields: ['id', 'time'],
                  sort: { time: 'asc' },
                  limit: deleteCount
                });
                // 删除多余的日志
                this.ctx.database.remove(database_name_log, {
                  id: row.map(item => item.id)
                })
              }
              break;
          }
        } catch (error) {
          // 记录日志失败时，输出错误信息
          this.log.error('写入日志失败：' + error.message)
        }
      }
}