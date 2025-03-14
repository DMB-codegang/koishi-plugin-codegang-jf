import { Context, Schema, Logger, Service, $ } from 'koishi'

export const name = 'codegang-jf'
export const description = 'Codegang基本积分管理插件'
const log = new Logger("@codegang/codegang-jf");
export const inject = {
  required: ['database']
}
const database_name = 'codegang_jf';
const database_name_log = 'codegang_jf_log';

export interface Config {
  check_jf_command_set: boolean
  check_jf_command?: string
  log: boolean
  max_log?: number
  only_success?: boolean
  log_type?: string[]
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    check_jf_command_set: Schema.boolean().default(true).description('是否为用户提供查询积分的指令'),
  }).description('基础设置'),
  Schema.union([
    Schema.object({
      check_jf_command_set: Schema.const(false).required(),
    }),
    Schema.object({
      check_jf_command_set: Schema.const(true),
      check_jf_command: Schema.string().default('你的积分是{jf}').description('查询积分指令返回的内容，`{jf}`为用户积分'),
    })
  ]),

  Schema.object({
    log: Schema.boolean().default(true).description('是否记录日志'),
  }).description('日志设置'),
  Schema.union([
    Schema.object({
      log: Schema.const(false).required(),
    }),
    Schema.object({
      log: Schema.const(true),
      only_success: Schema.boolean().default(true).description('是否只记录操作成功的日志'),
      max_log: Schema.number().default(100).min(5).description('最大日志记录数量'),
      log_type: Schema.array(
        Schema.union([
          Schema.const('get').description('get-获取积分'),
          Schema.const('set').description('set-设置积分'),
          Schema.const('add').description('add-增加积分'),
          Schema.const('reduce').description('reduce-减少积分')
        ])
      ).default(['add', 'reduce']).role('checkbox').description('记录日志的类型'),
    }),
  ]),
])

declare module 'koishi' {
  interface Tables {
    codegang_jf: codegang_jf
    codegang_jf_log: codegang_jf_log
  }
  interface Context {
    jf: jfService
  }
}

export interface codegang_jf {
  id: number
  userid: string
  username: string
  jf: number
  time: Date
}
export interface codegang_jf_log {
  id: number // 日志id
  userid: string // 被操作的用户id
  operationType: string // 操作类型，增加，减少，设置
  operationNum: number// 操作数量
  plugin: string // 操作插件
  success: boolean // 是否成功
  time: Date
}
// 有返回数据的
interface ApiResponse {
  code: number
  msg: string
  data: any
}
// 无返回数据的
interface ApiResponseNoData {
  code: number
  msg: string
}

export function apply(ctx: Context) {
  ctx.plugin(jfService)
  const jf = new jfService(ctx)
  ctx.command('查询积分')
    .action(async ({ session }) => {
      if (ctx.config.check_jf_command_set) {
        const jfResult = await jf.get(session.userId, name)
        const responseText = (ctx.config.check_jf_command).replace(/\{jf\}/gi, jfResult.data.toString())
        session.send(responseText)
      }
    })
}

export class jfService extends Service {
  static [Service.provide] = 'jf'
  constructor(ctx: Context) {
    super(ctx, 'jf', true)
    ctx.model.extend(database_name, {
      id: 'unsigned',
      userid: 'string',
      username: 'string',
      jf: 'integer',
      time: 'timestamp'
    }, { autoInc: true, primary: 'id' })
    ctx.model.extend(database_name_log, {
      id: 'unsigned',
      userid: 'string',
      operationType: 'string',
      plugin: 'string',
      success: 'boolean',
      time: 'timestamp'
    }, { primary: 'id' })
    log.info("插件加载成功")
  }

  // 取得用户积分，用户不存在则返回-1
  async get(userid: string, pluginName?: string): Promise<ApiResponse> {
    try {
      const row = await this.ctx.database.get(database_name, { userid })
      this.writelog({ userid: userid, operationType: 'get', plugin: pluginName, success: true })
      return { code: 200, msg: '请求成功', data: row.length ? row[0].jf : -1 }
    } catch (error) {
      this.writelog({ userid: userid, operationType: 'get', plugin: pluginName, success: false })
      log.error('查询积分失败：' + error)
      return { code: 500, msg: '查询积分失败', data: -500 }
    }
  }

  // 设置用户积分，用户不存在则创建
  async set(userid: string, jf: number, pluginName?: string): Promise<ApiResponseNoData> {
    if (jf < 0) {
      this.writelog({ userid: userid, operationType: 'set', plugin: pluginName, success: false })
      log.error('设置积分时出现错误：积分不能为负数')
      return { code: 400, msg: '积分不能为负数' }
    }
    try {
      await this.ctx.database.upsert(database_name, [{
        userid,
        jf,
        time: new Date()
      }], ['userid'])
      this.writelog({ userid: userid, operationType: 'set', plugin: pluginName, success: true })
      return { code: 200, msg: '设置成功' }
    } catch (error) {
      log.error('设置积分失败：' + error)
      return { code: 500, msg: '设置积分失败' }
    }
  }

  async add(userid: string, jf: number, pluginName?: string): Promise<ApiResponseNoData> {
    if (jf < 0) {
      this.writelog({ userid: userid, operationType: 'add', plugin: pluginName, success: false })
      log.error('增加积分时出现错误：积分不能为负数')
      return { code: 400, msg: '积分不能为负数' }
    }
    if (jf === 0) {
      this.writelog({ userid: userid, operationType: 'add', plugin: pluginName, success: true })
      return { code: 200, msg: '增加成功' }
    }
    try {
      const row = await this.ctx.database.get(database_name, { userid })
      if (row.length === 0) {
        await this.ctx.database.create(database_name, {
          userid,
          jf,
          time: new Date()
        })
      } else {
        await this.ctx.database.set(database_name, { userid }, {
          jf: row[0].jf + jf,
          time: new Date()
        })
      }
      this.writelog({ userid: userid, operationType: 'add', plugin: pluginName, success: true })
      return { code: 200, msg: '增加成功' }
    } catch (error) {
      log.error('增加积分失败：' + error)
      return { code: 500, msg: '增加积分失败' }
    }
  }

  async reduce(userid: string, jf: number, pluginName?: string): Promise<ApiResponseNoData> {
    if (jf < 0) {
      this.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, success: false })
      log.error('减少积分时出现错误：积分不能为负数')
      return { code: 400, msg: '积分不能为负数' }
    }
    if (jf === 0) {
      this.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, success: true })
      return { code: 200, msg: '减少成功' }
    }
    try {
      const row = await this.ctx.database.get(database_name, { userid })
      if (row.length === 0) {
        this.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, success: false })
        return { code: 400, msg: '用户不存在' }
      }
      if (row[0].jf < jf) {
        this.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, success: false })
        return { code: 400, msg: '用户积分不足' }
      }
      await this.ctx.database.set(database_name, { userid }, {
        jf: row[0].jf - jf,
        time: new Date()
      })
      this.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, success: true })
      return { code: 200, msg: '减少成功' }
    } catch (error) {
      log.error('减少积分失败：' + error)
      return { code: 500, msg: '减少积分失败' }
    }
  }

  async getTopUsers(num: number): Promise<Array<Object>> {
    let row = await this.ctx.database.select(database_name).orderBy('jf', 'desc').limit(num).execute()
    //转换为对象后返回
    return row.map((item: any) => {
      return { userid: item.userid, username: item.username, jf: item.jf };
    });
  }

  /**
   * 写入操作日志
   * @param logData 日志数据对象，包含用户ID、操作类型、插件名称等信息
   */
  private async writelog(logData: {
    userid: string
    operationType: string
    operationNum?: number
    success: boolean
    plugin?: string
  }) {
    // 如果日志功能未启用，直接返回
    if (!this.ctx.config.log) return 
    logData.plugin ??= 'unknown'
    logData.operationNum ??= null

    // 检查日志类型是否在允许列表中
    const typeAllowed = this.ctx.config.log_type.includes(logData.operationType)
    // 检查成功状态过滤条件
    const successFilter = this.ctx.config.only_success ? logData.success : true
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
      log.error('写入日志失败：' + error.message)
    }
  }
}
