/**
 * 腾讯地图 WebService API 转发服务
 * 
 * 地图选点插件的工作机制：
 * 插件内部向 host 发起请求 → 本云函数转发（加签名）→ 腾讯 WebService API
 * 
 * 参考文档：https://lbs.qq.com/miniProgram/plugin/pluginGuide/chooseLocation
 */

const crypto = require('crypto')

// 腾讯位置服务配置
const CONFIG = {
  KEY: 'SXGBZ-RHQ6M-26V6Z-6UTTU-JGKUV-TVFJS',
  SK: 'hAkWuPAELmNXsqeWntgwpmYP7hsjFs2l',
  BASE_URL: 'https://apis.map.qq.com'
}

/**
 * 生成签名（SN校验）
 * @param {string} path - API路径
 * @param {object} params - 请求参数（原始值，不URL编码）
 * @param {string} sk - Secret Key
 * @returns {string} 32位小写MD5签名
 */
function generateSignature(path, params, sk) {
  // 按参数名字母升序排列
  const sortedKeys = Object.keys(params).sort()
  // 拼接参数字符串（原始值，不URL编码）
  const paramStr = sortedKeys.map(key => `${key}=${params[key]}`).join('&')
  // 拼接签名字符串：路径?参数字符串SK
  const signStr = `${path}?${paramStr}${sk}`
  console.log('[签名字符串]', signStr)
  return crypto.createHash('md5').update(signStr).digest('hex').toLowerCase()
}

/**
 * 发起 HTTP 请求到腾讯 WebService API
 */
async function callApi(path, params) {
  // 生成签名（用原始参数，不含sig）
  const sig = generateSignature(path, params, CONFIG.SK)
  
  // 构建请求URL（需要URL编码参数值）
  const queryParts = Object.keys(params)
    .sort()
    .map(key => `${key}=${encodeURIComponent(String(params[key]))}`)
  queryParts.push(`sig=${sig}`)
  const url = `${CONFIG.BASE_URL}${path}?${queryParts.join('&')}`
  
  console.log('[请求URL]', url)
  
  const response = await fetch(url)
  const data = await response.json()
  console.log('[API响应]', JSON.stringify(data).substring(0, 200))
  return data
}

// 云函数入口
exports.main = async (event, context) => {
  const { action, params: reqParams } = event

  try {
    let result

    switch (action) {
      // 地点搜索（插件内搜索框使用）
      case 'place_search': {
        const params = {
          key: CONFIG.KEY,
          keyword: reqParams.keyword || '',
          page_size: reqParams.page_size || 20,
          page_index: reqParams.page_index || 1,
          output: 'json'
        }
        if (reqParams.location) params.location = reqParams.location
        if (reqParams.region) params.region = reqParams.region
        result = await callApi('/ws/place/v1/search', params)
        break
      }
      
      // 关键词联想提示（输入搜索关键词时使用）
      case 'suggestion': {
        const params = {
          key: CONFIG.KEY,
          keyword: reqParams.keyword || '',
          output: 'json'
        }
        if (reqParams.location) params.location = reqParams.location
        if (reqParams.region) params.region = reqParams.region
        result = await callApi('/ws/place/v1/suggestion', params)
        break
      }
      
      // 逆地址解析（坐标转地址）
      case 'geocoder': {
        const params = {
          key: CONFIG.KEY,
          location: reqParams.location,
          output: 'json'
        }
        result = await callApi('/ws/geocoder/v1/', params)
        break
      }

      // 周边推荐
      case 'nearby': {
        const params = {
          key: CONFIG.KEY,
          location: reqParams.location,
          page_size: reqParams.page_size || 20,
          page_index: reqParams.page_index || 1,
          output: 'json'
        }
        result = await callApi('/ws/place/v1/search', params)
        break
      }

      default:
        return { code: -1, message: `未知的 action: ${action}` }
    }

    return { code: 0, message: 'success', data: result }

  } catch (error) {
    console.error('[错误]', error)
    return { code: -1, message: error.message || '请求失败' }
  }
}
