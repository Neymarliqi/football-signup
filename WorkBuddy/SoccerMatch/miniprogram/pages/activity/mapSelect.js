// pages/activity/mapSelect.js
const app = getApp()

// 腾讯地图 Key
const TENCENT_MAP_KEY = 'SXGBZ-RHQ6M-26V6Z-6UTTU-JGKUV-TVFJS'

Page({
  data: {
    show: false,
    isSearching: false,
    keyword: '',
    mapCenter: {
      latitude: 30.2741,
      longitude: 120.1551
    },
    markers: [],
    currentPoi: null,
    nearbyPois: [],
    searchResults: [],
    selectedPoi: null,
    selectedIndex: -1,
    userLocation: null
  },

  onLoad(options) {
    // 延迟显示动画
    setTimeout(() => {
      this.setData({ show: true })
    }, 50)

    // 如果有传入的位置，使用传入的位置
    if (options.latitude && options.longitude) {
      this.setData({
        'mapCenter.latitude': parseFloat(options.latitude),
        'mapCenter.longitude': parseFloat(options.longitude)
      })
      this.getPoiByLocation(parseFloat(options.latitude), parseFloat(options.longitude))
    } else {
      // 获取当前位置
      this.getCurrentLocation()
    }
  },

  // 获取当前位置
  getCurrentLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const { latitude, longitude } = res
        this.setData({
          'mapCenter.latitude': latitude,
          'mapCenter.longitude': longitude,
          userLocation: { latitude, longitude }
        })
        this.getPoiByLocation(latitude, longitude)
      },
      fail: () => {
        wx.showToast({
          title: '获取位置失败',
          icon: 'none'
        })
      }
    })
  },

  // 根据坐标获取POI信息
  getPoiByLocation(latitude, longitude) {
    wx.request({
      url: 'https://apis.map.qq.com/ws/geocoder/v1/',
      data: {
        location: `${latitude},${longitude}`,
        key: TENCENT_MAP_KEY,
        get_poi: 1,
        poi_options: 'policy=2;radius=1000;page_size=20'
      },
      success: (res) => {
        if (res.data.status === 0) {
          const result = res.data.result
          const currentPoi = {
            id: 'current',
            title: result.formatted_addresses?.recommend || '当前位置',
            address: result.address,
            latitude: latitude,
            longitude: longitude
          }
          
          // 处理附近POI
          const nearbyPois = (result.pois || []).map((poi, index) => ({
            id: poi.id || `poi-${index}`,
            title: poi.title,
            address: poi.address,
            latitude: poi.location.lat,
            longitude: poi.location.lng,
            distance: poi.distance
          }))

          this.setData({
            currentPoi,
            nearbyPois,
            selectedPoi: currentPoi,
            selectedIndex: -1
          })

          this.updateMarkers()
        }
      }
    })
  },

  // 更新地图标记
  updateMarkers() {
    const { selectedPoi } = this.data
    if (!selectedPoi) return

    const markers = [{
      id: 1,
      latitude: selectedPoi.latitude,
      longitude: selectedPoi.longitude,
      title: selectedPoi.title,
      iconPath: '', // 使用默认标记
      width: 30,
      height: 30
    }]

    this.setData({ markers })
  },

  // 地图视野变化
  onMapRegionChange(e) {
    if (e.type === 'end' && (e.causedBy === 'drag' || e.causedBy === 'scale')) {
      // 防抖处理，避免频繁请求
      if (this.mapChangeTimer) {
        clearTimeout(this.mapChangeTimer)
      }
      this.mapChangeTimer = setTimeout(() => {
        const mapCtx = wx.createMapContext('locationMap')
        mapCtx.getCenterLocation({
          success: (res) => {
            this.setData({
              'mapCenter.latitude': res.latitude,
              'mapCenter.longitude': res.longitude
            })
            this.getPoiByLocation(res.latitude, res.longitude)
          }
        })
      }, 500)
    }
  },

  // 重新定位
  onRelocate() {
    if (this.data.userLocation) {
      const { latitude, longitude } = this.data.userLocation
      this.setData({
        'mapCenter.latitude': latitude,
        'mapCenter.longitude': longitude
      })
      this.getPoiByLocation(latitude, longitude)
    } else {
      this.getCurrentLocation()
    }
  },

  // 选择POI
  onSelectPoi(e) {
    const { poi, index } = e.currentTarget.dataset
    this.setData({
      selectedPoi: poi,
      selectedIndex: parseInt(index),
      'mapCenter.latitude': poi.latitude,
      'mapCenter.longitude': poi.longitude
    })
    this.updateMarkers()
  },

  // 搜索相关
  onSearchFocus() {
    this.setData({ isSearching: true })
  },

  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    
    if (keyword) {
      this.doSearch(keyword)
    } else {
      this.setData({ searchResults: [] })
    }
  },

  onSearchConfirm() {
    if (this.data.keyword) {
      this.doSearch(this.data.keyword)
    }
  },

  onClearSearch() {
    this.setData({
      keyword: '',
      searchResults: []
    })
  },

  onCancelSearch() {
    this.setData({
      isSearching: false,
      keyword: '',
      searchResults: []
    })
  },

  onSearchBlur() {
    // 延迟处理，避免点击搜索结果时先触发blur
    setTimeout(() => {
      if (!this.data.keyword) {
        this.setData({ isSearching: false })
      }
    }, 200)
  },

  // 执行搜索
  doSearch(keyword) {
    // 防抖处理
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
    }
    
    this.searchTimer = setTimeout(() => {
      const { mapCenter, userLocation } = this.data
      
      wx.request({
        url: 'https://apis.map.qq.com/ws/place/v1/suggestion',
        data: {
          keyword: keyword,
          location: userLocation ? `${userLocation.latitude},${userLocation.longitude}` : `${mapCenter.latitude},${mapCenter.longitude}`,
          key: TENCENT_MAP_KEY,
          page_size: 20
        },
        success: (res) => {
          if (res.data.status === 0) {
            const searchResults = res.data.data.map(item => ({
              id: item.id,
              title: item.title,
              address: item.address,
              latitude: item.location.lat,
              longitude: item.location.lng,
              distance: item.distance ? (item.distance / 1000).toFixed(1) : null
            }))
            this.setData({ searchResults })
          }
        }
      })
    }, 300)
  },

  // 选择搜索结果
  onSelectSearchResult(e) {
    const { poi } = e.currentTarget.dataset
    
    // 退出搜索模式，回到地图模式
    this.setData({
      isSearching: false,
      keyword: '',
      searchResults: [],
      selectedPoi: poi,
      selectedIndex: -1,
      'mapCenter.latitude': poi.latitude,
      'mapCenter.longitude': poi.longitude
    })

    // 重新获取该位置附近的POI
    this.getPoiByLocation(poi.latitude, poi.longitude)
  },

  // 取消
  onCancel() {
    this.setData({ show: false })
    setTimeout(() => {
      wx.navigateBack()
    }, 300)
  },

  // 确定
  onConfirm() {
    const { selectedPoi } = this.data
    if (!selectedPoi) {
      wx.showToast({
        title: '请选择位置',
        icon: 'none'
      })
      return
    }

    // 返回上一页并传递数据
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    
    if (prevPage) {
      prevPage.setData({
        'form.locationName': selectedPoi.title,
        'form.location': selectedPoi.address,
        'form.latitude': selectedPoi.latitude,
        'form.longitude': selectedPoi.longitude
      })
    }

    this.setData({ show: false })
    setTimeout(() => {
      wx.navigateBack()
    }, 300)
  }
})