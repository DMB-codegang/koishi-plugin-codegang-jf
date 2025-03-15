import { Schema } from 'koishi'

export interface Config {
    check_jf_command_set: boolean
    check_jf_command?: string
    log: boolean
    max_log?: number
    only_success_false?: boolean
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
        log: Schema.boolean().default(false).description('是否记录日志'),
    }).description('日志设置'),
    Schema.union([
        Schema.object({
            log: Schema.const(false),
        }),
        Schema.object({
            log: Schema.const(true),
            only_success_false: Schema.boolean().default(true).description('是否只记录操作失败的日志'),
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