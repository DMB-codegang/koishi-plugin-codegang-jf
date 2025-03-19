import { Context, Logger, Service } from 'koishi'
import { randomBytes } from 'crypto';

import { LogService } from './logService';
import { codegang_jf, codegang_jf_log, ApiResponseNoData } from './types';
export const name = 'codegang-jf'
export const description = 'Codegang基本积分管理插件'
const log = new Logger("@codegang/codegang-jf");
export const inject = {
  required: ['database']
}
const database_name = 'codegang_jf';

import { Config } from './config'
export * from './config'

declare module 'koishi' {
  interface Tables {
    codegang_jf: codegang_jf
    codegang_jf_log: codegang_jf_log
  }
  interface Context {
    jf: jfService
  }
}

export function apply(ctx: Context, cfg: Config) {
  ctx.plugin(jfService, cfg)
  const jf = new jfService(ctx, cfg) // 通过实例化解决koishi报inject中没有服务jf的警告
  ctx.on('message', async (session) => {
    if (cfg.auto_log_username && cfg.auto_log_username_type === 'all') {
      const username = session.username
      const database_username = await ctx.database.get(database_name, { userid: session.userId })
      if (database_username.length === 0 || database_username[0].username !== username) {
        await jf.set(session.userId, username, 0, name)//更新用户名
      }
    }
  })
  ctx.command('查询积分').action(async ({ session }) => {
    if (cfg.check_jf_command_set) {
      const jfResult = await jf.get(session.userId, name)
      const responseText = (cfg.check_jf_command).replace(/\{jf\}/gi, jfResult.toString())
      session.send(responseText)
      if (cfg.auto_log_username && cfg.auto_log_username_type === 'only_command') {
        const username = session.username
        const database_username = await ctx.database.get(database_name, { userid: session.userId })
        if (database_username.length === 0 || database_username[0].username !== username) {
          jf.updateUserName(session.userId, session.username)//更新用户名
        }
      }
    }
  })
}

export class jfService extends Service {
  static [Service.provide] = 'jf'
  private logService: LogService
  private cfg: Config
  constructor(ctx: Context, cfg: Config) {
    super(ctx, 'jf', true)
    // 初始化日志服务
    this.logService = new LogService(ctx, cfg)
    this.cfg = cfg
    ctx.model.extend(database_name, {
      id: 'unsigned',
      userid: 'string',
      username: 'string',
      jf: 'integer',
    }, { autoInc: true, primary: 'id' })
    log.info("插件加载成功")
  }

  checkTransactionId(transactionId: string): boolean {
    // 修正校验逻辑为四段式结构（前缀-时间戳-微秒-随机数）
    return Boolean(
      transactionId?.startsWith('tx-') && 
      transactionId.split('-').length === 4
    )
  }

  generateTransactionId(prefix: string = 'tx'): string {
    // 重构生成逻辑为四段式结构
    const baseTime = Date.now().toString(36).padStart(10, '0')
    const hrtime = process.hrtime()
    const micro = Math.floor(hrtime[1]/1000).toString(36).padStart(4, '0')
    
    // 生成8字节随机数（10位base36）
    const random = randomBytes(8)
      .readBigUInt64BE()
      .toString(36)
      .padStart(10, '0')

    // 格式：tx-时间戳-微秒-随机数
    return `${prefix}-${baseTime}-${micro}-${random}`
  }

  // 取得用户积分，用户不存在则返回-1
  async get(userid: string, pluginName?: string): Promise<number> {
    try {
      const row = await this.ctx.database.get(database_name, { userid })
      this.logService.writelog({ userid: userid, operationType: 'get', plugin: pluginName, statusCode: 200 })
      return row.length ? row[0].jf : -1
    } catch (error) {
      this.logService.writelog({ userid: userid, operationType: 'get', plugin: pluginName, comment: `调用get时出现错误：${error}`, statusCode: 500 })
      log.error('查询积分失败：' + error)
      throw new Error('查询积分失败：' + error)
    }
  }
  async getUserName(userid: string, pluginName?: string): Promise<string> {
    try {
      const row = await this.ctx.database.get(database_name, { userid })
      this.logService.writelog({ userid: userid, operationType: 'get', plugin: pluginName, statusCode: 200 })
      return row.length ? row[0].username : '未知'
    } catch (error) {
      this.logService.writelog({ userid: userid, operationType: 'get', plugin: pluginName, comment: `调用get时出现错误：${error}`, statusCode: 500 })
      log.error('查询积分失败：' + error)
      throw new Error('查询积分失败：' + error)
    }
  }
  // 设置用户积分，用户不存在则创建
  async set(userid: string, transactionId: string, jf: number, pluginName?: string): Promise<ApiResponseNoData> {
    //校验transactionId是否是合法的
    if (transactionId || this.checkTransactionId(transactionId) === false) {
      this.logService.writelog({ userid: userid, operationType: 'set', plugin: pluginName, comment: `调用get时出现错误：transactionId无效`, statusCode: 400 })
      return { code: 400, msg: 'transactionId无效' }
    }
    if (jf < 0) {
      this.logService.writelog({ userid: userid, operationType: 'set', plugin: pluginName, comment: `调用set时出现错误：积分不能为负数`, statusCode: 400 })
      log.error('设置积分时出现错误：积分不能为负数')
      return { code: 400, msg: '积分不能为负数' }
    }
    try {
      const oldValue = (await this.ctx.database.get(database_name, { userid }))[0]?.jf || 0; // 获取旧值
      await this.ctx.database.upsert(database_name, [{ userid, jf }], ['userid'])
      this.logService.writelog({ userid: userid, operationType: 'set', plugin: pluginName, statusCode: 200, oldValue: oldValue, transactionId: this.generateTransactionId() })
      return { code: 200, msg: '设置成功' }
    } catch (error) {
      log.error('设置积分失败：' + error)
      this.logService.writelog({ userid: userid, operationType: 'set', plugin: pluginName, comment: `调用set时出现错误：${error}`, statusCode: 500 })
      return { code: 500, msg: '设置积分失败' }
    }
  }
  // 增加用户积分，用户不存在则创建
  async add(userid: string, transactionId: string, jf: number, pluginName?: string): Promise<ApiResponseNoData> {
    //校验transactionId是否是合法的
    if (this.checkTransactionId(transactionId) === false) {
      this.logService.writelog({ userid: userid, operationType: 'add', plugin: pluginName, comment: `调用get时出现错误：transactionId无效`, statusCode: 400 })
      return { code: 400, msg: 'transactionId无效' }
    }
    if (jf < 0) {
      this.logService.writelog({ userid: userid, operationType: 'add', plugin: pluginName, comment: `调用add时出现错误：积分不能为负`, statusCode: 400 })
      log.error('增加积分时出现错误：积分不能为负数')
      return { code: 400, msg: '积分不能为负数' }
    }
    if (jf === 0) {
      this.logService.writelog({ userid: userid, operationType: 'add', plugin: pluginName, statusCode: 204 })
      return { code: 204, msg: '增加成功，但意义是什么' }
    }
    try {
      const row = await this.ctx.database.get(database_name, { userid })
      if (row.length === 0) {
        const initial_jf = this.cfg.initial_jf
        const newValue = initial_jf + jf
        await this.ctx.database.create(database_name, { userid: userid, jf: newValue })
        this.logService.writelog({
          userid: userid,
          operationType: 'add',
          newValue: newValue,
          plugin: pluginName,
          statusCode: 200,
          oldValue: 0,
          transactionId: transactionId
        })
      } else {
        const newValue = row[0].jf + jf
        await this.ctx.database.set(database_name, { userid: userid }, { jf: newValue })
        this.logService.writelog({
          userid: userid,
          operationType: 'add',
          newValue: newValue,
          plugin: pluginName,
          statusCode: 200,
          oldValue: row[0].jf,
          transactionId: transactionId
        })
      }
      return { code: 200, msg: '增加成功' }
    } catch (error) {
      log.error('增加积分失败：' + error)
      this.logService.writelog({ 
        userid: userid, 
        operationType: 'add', 
        plugin: pluginName, 
        comment: `服务端错误：${error.message}`,
        statusCode: 500 
      })
      return { code: 500, msg: '增加积分失败' }
    }
  }
  // 减少用户积分，用户不存在则返回错误，用户积分不足则返回错误
  async reduce(userid: string, transactionId: string, jf: number, pluginName?: string): Promise<ApiResponseNoData> {
    if (jf < 0) {
      this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, comment: `调用reduce时出现错误：积分不能为负数`, statusCode: 400 })
      log.error('减少积分时出现错误：积分不能为负数')
      return { code: 400, msg: '积分不能为负数' }
    }
    if (jf === 0) {
      this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, statusCode: 204 })
      return { code: 204, msg: '减少成功，但意义是什么' }
    }
    try {
      const row = await this.ctx.database.get(database_name, { userid })
      if (row.length === 0) {
        this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, comment: `调用reduce时出现错误：用户不存在`, statusCode: 400 })
        return { code: 400, msg: '用户不存在' }
      }
      if (row[0].jf < jf) {
        this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, comment: `调用reduce被拒绝：用户积分不足`, statusCode: 304 })
        return { code: 304, msg: '用户积分不足' }
      }
      await this.ctx.database.set(database_name, { userid }, {
        jf: row[0].jf - jf
      })
      this.logService.writelog({ userid: userid, operationType: 'reduce', newValue: row[0].jf - jf, plugin: pluginName, statusCode: 200, oldValue: row[0].jf, transactionId: transactionId })
      return { code: 200, msg: '减少成功' }
    } catch (error) {
      log.error('减少积分失败：' + error)
      this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, comment: `调用reduce时出现错误：${error}`, statusCode: 500 })
      return { code: 500, msg: '减少积分失败' }
    }
  }

  async updateUserName(userid: string, username: string, pluginName?: string): Promise<ApiResponseNoData> {
    pluginName ??= 'unknown'
    try {
      await this.ctx.database.set(database_name, { userid }, { username })
      this.logService.writelog({ userid: userid, operationType: 'updateUserName', plugin: pluginName, statusCode: 200 })
      return { code: 200, msg: '更新成功' }
    } catch (error) {
      log.error('更新用户名失败：' + error)
      this.logService.writelog({ userid: userid, operationType: 'updateUserName', plugin: pluginName, comment: `调用updateUserName时出现错误：${error}`, statusCode: 500 })
      return { code: 500, msg: '更新用户名失败' }
    }
  }

  async getTopUsers(num: number): Promise<{
    userid: string
    username: string
    jf: number
  }[]> {
    if (!Number.isInteger(num) || num <= 0) {
      this.logService.writelog({ userid: '0', operationType: 'getTopUsers', plugin: name, comment: `调用getTopUsers时出现错误：参数必须为正整数`, statusCode: 400 })
      throw new Error('参数必须为正整数')
    }
    try {
      const topUsers = await this.ctx.database
        .select(database_name)
        .orderBy('jf', 'desc')
        .limit(num)
        .execute()
      return topUsers.map((item): {
        userid: string
        username: string
        jf: number
      } => ({
        userid: item.userid,
        username: item.username,
        jf: item.jf
      }))
    } catch (error) {
      log.error(`获取前${num}名用户失败：${error.message}`)
      this.logService.writelog({ userid: '0', operationType: 'getTopUsers', plugin: name, comment: `调用getTopUsers时出现错误：${error}`, statusCode: 500 })
      throw new Error('获取排行榜失败')
    }
  }
}
