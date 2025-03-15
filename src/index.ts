import { Context, Schema, Logger, Service } from 'koishi'

import { } from './config'
import { LogService } from './logService';
import { codegang_jf, codegang_jf_log, ApiResponse, ApiResponseNoData } from './types';
export const name = 'codegang-jf'
export const description = 'Codegang基本积分管理插件'
const log = new Logger("@codegang/codegang-jf");
export const inject = {
  required: ['database']
}
const database_name = 'codegang_jf';

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

export function apply(ctx: Context) {
  ctx.plugin(jfService)
  const jf = new jfService(ctx) // 通过实例化解决koishi报inject中没有服务jf的警告
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
  private logService: LogService
  constructor(ctx: Context) {
    super(ctx, 'jf', true)
    // 初始化日志服务
    this.logService = new LogService(ctx)
    ctx.model.extend(database_name, {
      id: 'unsigned',
      userid: 'string',
      username: 'string',
      jf: 'integer',
      time: 'timestamp'
    }, { autoInc: true, primary: 'id' })
    log.info("插件加载成功")
  }

  // 取得用户积分，用户不存在则返回-1
  async get(userid: string, pluginName?: string): Promise<ApiResponse> {
    try {
      const row = await this.ctx.database.get(database_name, { userid })
      this.logService.writelog({ userid: userid, operationType: 'get', plugin: pluginName, success: true })
      return { code: 200, msg: '请求成功', data: row.length ? row[0].jf : -1 }
    } catch (error) {
      this.logService.writelog({ userid: userid, operationType: 'get', plugin: pluginName, comment: `调用get时出现错误：${error}`, success: false })
      log.error('查询积分失败：' + error)
      return { code: 500, msg: '查询积分失败', data: -500 }
    }
  }

  // 设置用户积分，用户不存在则创建
  async set(userid: string, jf: number, pluginName?: string): Promise<ApiResponseNoData> {
    if (jf < 0) {
      this.logService.writelog({ userid: userid, operationType: 'set', plugin: pluginName, comment: `调用set时出现错误：积分不能为负数`, success: false })
      log.error('设置积分时出现错误：积分不能为负数')
      return { code: 400, msg: '积分不能为负数' }
    }
    try {
      await this.ctx.database.upsert(database_name, [{
        userid,
        jf,
        time: new Date()
      }], ['userid'])
      this.logService.writelog({ userid: userid, operationType: 'set', plugin: pluginName, success: true })
      return { code: 200, msg: '设置成功' }
    } catch (error) {
      log.error('设置积分失败：' + error)
      this.logService.writelog({ userid: userid, operationType: 'set', plugin: pluginName, comment: `调用set时出现错误：${error}`, success: false })
      return { code: 500, msg: '设置积分失败' }
    }
  }

  // 增加用户积分，用户不存在则创建
  async add(userid: string, jf: number, pluginName?: string): Promise<ApiResponseNoData> {
    if (jf < 0) {
      this.logService.writelog({ userid: userid, operationType: 'add', plugin: pluginName, comment: `调用add时出现错误：积分不能为负`, success: false })
      log.error('增加积分时出现错误：积分不能为负数')
      return { code: 400, msg: '积分不能为负数' }
    }
    if (jf === 0) {
      this.logService.writelog({ userid: userid, operationType: 'add', plugin: pluginName, success: true })
      return { code: 200, msg: '增加成功，但意义是什么' }
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
      this.logService.writelog({ userid: userid, operationType: 'add', plugin: pluginName, success: true })
      return { code: 200, msg: '增加成功' }
    } catch (error) {
      log.error('增加积分失败：' + error)
      this.logService.writelog({ userid: userid, operationType: 'add', plugin: pluginName, comment: `调用add时出现错误：${error}`, success: false })
      return { code: 500, msg: '增加积分失败' }
    }
  }

  // 减少用户积分，用户不存在则返回错误，用户积分不足则返回错误
  async reduce(userid: string, jf: number, pluginName?: string): Promise<ApiResponseNoData> {
    if (jf < 0) {
      this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, comment: `调用reduce时出现错误：积分不能为负数`, success: false })
      log.error('减少积分时出现错误：积分不能为负数')
      return { code: 400, msg: '积分不能为负数' }
    }
    if (jf === 0) {
      this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, success: true })
      return { code: 200, msg: '减少成功' }
    }
    try {
      const row = await this.ctx.database.get(database_name, { userid })
      if (row.length === 0) {
        this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, comment: `调用reduce时出现错误：用户不存在`, success: false })
        return { code: 400, msg: '用户不存在' }
      }
      if (row[0].jf < jf) {
        this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, comment: `调用reduce被拒绝：用户积分不足`, success: false })
        return { code: 304, msg: '用户积分不足' }
      }
      await this.ctx.database.set(database_name, { userid }, {
        jf: row[0].jf - jf,
        time: new Date()
      })
      this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, success: true })
      return { code: 200, msg: '减少成功' }
    } catch (error) {
      log.error('减少积分失败：' + error)
      this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, comment: `调用reduce时出现错误：${error}`, success: false })
      return { code: 500, msg: '减少积分失败' }
    }
  }

  async getTopUsers(num: number): Promise<{
    userid: string
    username: string
    jf: number
  }[]> {
    if (!Number.isInteger(num) || num <= 0) {
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
      throw new Error('获取排行榜失败')
    }
  }
}
