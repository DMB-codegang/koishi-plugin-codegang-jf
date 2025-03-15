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
    comment: string // 操作注释
    plugin: string // 操作插件
    success: boolean // 是否成功
    time: Date
}
// 有返回数据的
export interface ApiResponse {
    code: number
    msg: string
    data: any
}
// 无返回数据的
export interface ApiResponseNoData {
    code: number
    msg: string
}