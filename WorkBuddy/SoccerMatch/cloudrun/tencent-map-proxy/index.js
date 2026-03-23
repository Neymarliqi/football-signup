/**
 * 腾讯地图 WebService API 签名转发服务
 * 
 * 工作机制：
 * 地图选点插件 → 本服务（加签名）→ 腾讯 WebService API → 返回结果给插件
 * 
 * 部署：微信云托管
 */

const express = require('express')
const crypto = require('crypto')
const https = require('https')
const http = require('http')

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ============================================================
// 配置区（只需修改这里）
// ============================================================
const CONFIG = {
  // 你的腾讯位置服务 Key
  KEY: 'SXGBZ-RHQ6M-26V6Z-6UTTU-JGKUV-TVFJS',
  // 你的 SK（Secret Key），在腾讯位置服务控制台 -> Key设置 -> 签名校验中获取
  SK: 'hAkWuPAELmNXsqeWntgwpmYP7hsjFs2l',
  // 腾讯 WebService API 域名
  API_BASE: 'apis.map.qq.com'
}
// ============================================================

/**
 * 计算 SN 签名
 * 规则：MD5(请求路径?按字母排序的参数字符串SK)
 * 
 * @param {string} path - API 路径，如 /ws/place/v1/search
 * @param {object} params - 请求参数（不含 sig）
 * @param {string} sk - Secret Key
 * @returns {string} 32位小写 MD5 签名
 */
function signRequest(path, params, sk) {
  const sortedKeys = Object.keys(params).sort()
  const paramStr = sortedKeys.map(k => `${k}=${params[k]}`).join('&')
  const raw = `${path}?${paramStr}${sk}`
  console.log('[签名原串]', raw)
  return crypto.createHash('md5').update(raw).digest('hex').toLowerCase()
}

/**
 * 发起 HTTPS 请求到腾讯 API
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          resolve({ status: -1, message: '解析响应失败', raw: data })
        }
      })
    }).on('error', reject)
  })
}

/**
 * 核心转发逻辑：给请求加上签名，然后转发给腾讯 API
 */
async function proxyRequest(path, query) {
  // 1. 合并参数（注入 key）
  const params = { ...query, key: CONFIG.KEY }
  // 2. 删除可能已有的 sig，重新计算
  delete params.sig

  // 3. 计算签名（使用原始值，不 URL 编码）
  const sig = signRequest(path, params, CONFIG.SK)

  // 4. 构建带签名的请求 URL（参数值需 URL 编码）
  const sortedKeys = Object.keys(params).sort()
  const queryStr = sortedKeys
    .map(k => `${k}=${encodeURIComponent(String(params[k]))}`)
    .join('&')
  const url = `https://${CONFIG.API_BASE}${path}?${queryStr}&sig=${sig}`

  console.log('[转发URL]', url)

  // 5. 请求腾讯 API
  return await httpsGet(url)
}

// ============================================================
// 路由（地图选点插件会请求这些路径）
// ============================================================

// 地点搜索（插件搜索框）
app.get('/ws/place/v1/search', async (req, res) => {
  try {
    const result = await proxyRequest('/ws/place/v1/search', req.query)
    res.json(result)
  } catch (e) {
    console.error('[place/search 错误]', e)
    res.status(500).json({ status: -1, message: e.message })
  }
})

// 关键词联想（输入时的下拉提示）
app.get('/ws/place/v1/suggestion', async (req, res) => {
  try {
    const result = await proxyRequest('/ws/place/v1/suggestion', req.query)
    res.json(result)
  } catch (e) {
    console.error('[place/suggestion 错误]', e)
    res.status(500).json({ status: -1, message: e.message })
  }
})

// 逆地址解析（坐标 → 地址）
app.get('/ws/geocoder/v1/', async (req, res) => {
  try {
    const result = await proxyRequest('/ws/geocoder/v1/', req.query)
    res.json(result)
  } catch (e) {
    console.error('[geocoder 错误]', e)
    res.status(500).json({ status: -1, message: e.message })
  }
})

// 周边搜索
app.get('/ws/place/v1/nearby', async (req, res) => {
  try {
    const result = await proxyRequest('/ws/place/v1/nearby', req.query)
    res.json(result)
  } catch (e) {
    console.error('[place/nearby 错误]', e)
    res.status(500).json({ status: -1, message: e.message })
  }
})

// 健康检查（云托管需要）
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'tencent-map-proxy' })
})

// 启动服务（云托管监听 80 端口）
const PORT = process.env.PORT || 80
app.listen(PORT, () => {
  console.log(`腾讯地图代理服务已启动，端口: ${PORT}`)
})
