importScripts('./workbox-sw.js')
workbox.setConfig({debug: true})

workbox.loadModule('workbox-strategies')
workbox.loadModule('workbox-routing')
workbox.loadModule('workbox-expiration')
workbox.loadModule('workbox-cacheable-response')

const {skipWaiting, clientsClaim} = workbox.core
const {CacheableResponsePlugin} = workbox.cacheableResponse
const {ExpirationPlugin} = workbox.expiration
const {Strategy, CacheFirst} = workbox.strategies

const REQUEST_DESTINATION = {
    SCRIPT: 'script',
    IMAGE: 'image',
    STYLE: 'style',
    FONT: 'font'
}

const CACHE_NAME_PREFIX = 'lazada_gcp_'

const CACHE_NAME = {
    SCRIPT: CACHE_NAME_PREFIX + 'script',
    IMAGE: CACHE_NAME_PREFIX + 'image',
    STYLE: CACHE_NAME_PREFIX + 'style',
    FONT: CACHE_NAME_PREFIX + 'font'
}

const commonCacheablePlugin = new CacheableResponsePlugin({
    statuses: [200]
})

const comboUriPrefix = [
    'https://g.alicdn.com/??'
]

const cachesMap = []

class ComboCacheFirst extends Strategy {
    _handle(request, handler) {
        const comboUrl = request.url
        const comboUrlSplited = comboUrl.split('??')
        const urls = comboUrlSplited[1].split(',').map(item => `${comboUrlSplited[0]}${item}`)
        const start = Date.now()
        console.time('11111' + start)
        return new Promise((resolve, reject) => {
            caches.open(CACHE_NAME.SCRIPT).then((cache) => {
                return Promise.all(urls.map(url => {
                    return cache.match(url)
                })).then(responses => {
                    console.timeEnd('11111' + start)
                    const notCachedUrls = []
                    const urlResponseMap = new Map()
                    for (let i = 0; i < responses.length; i++) {
                        const url = urls[i]
                        const response = responses[i]
                        if (response) {
                            urlResponseMap.set(url, response)
                        } else {
                            notCachedUrls.push(url)
                        }
                    }
                    // 缺失的模块从服务器拉取
                    const notCachedRequests = notCachedUrls.map(notCachedUrl => new Request(notCachedUrl))
                    return Promise.all(notCachedRequests.map(notCachedRequest => {
                        return fetch(notCachedRequest)
                    })).then((fetchedResponses) => {
                        fetchedResponses.forEach((response, index) => {
                            cache.put(notCachedRequests[index], response.clone())
                        })
                        for (let i = 0; i < fetchedResponses.length; i++) {
                            const url = notCachedUrls[i]
                            const response = fetchedResponses[i]
                            urlResponseMap.set(url, response)
                        }
                        console.time('22222' + start)
                        Promise.all(urls.map(url => urlResponseMap.get(url)).map((item) => {
                            return item.text()
                        })).then((bodies) => {
                            console.timeEnd('22222' + start)
                            const headers = {status: '200', 'Content-Type': 'application/javascript; charset=utf-8', 'content-encoding': 'gzip', 'fromSw': 'true'}
                            const body = bodies.join('')
                            const response = new Response(body, {headers})
                            resolve(response)
                        }).catch(e => {
                            console.log(e)
                            resolve(handler.fetch(request))
                        })
                    }).catch(e => {
                        console.log(e)
                        resolve(handler.fetch(request))
                    })
                }).catch(e => {
                    console.log(e)
                    resolve(handler.fetch(request))
                })
            }).catch(e => {
                console.log(e)
                resolve(handler.fetch(request))
            })
        })
    }
}

workbox.routing.registerRoute(
        ({url, request}) => {
            if (request.destination !== REQUEST_DESTINATION.SCRIPT) {
                return false
            }
            for (const prefix of comboUriPrefix) {
                if (url.href.startsWith(prefix)) {
                    return true
                }
            }
            return false
        },
        new ComboCacheFirst({
            cacheName: CACHE_NAME.SCRIPT,
            plugins: [
                commonCacheablePlugin,
                new ExpirationPlugin({
                    maxEntries: 200
                })
            ]
        })
    )

workbox.routing.registerRoute(
        ({request}) => {
            return request.destination === REQUEST_DESTINATION.FONT
        },
        new CacheFirst({
            cacheName: CACHE_NAME.FONT,
            plugins: [
                commonCacheablePlugin,
                new ExpirationPlugin({
                    maxEntries: 10
                })
            ]
        })
    )

workbox.routing.registerRoute(
        ({request}) => {
            return request.destination === REQUEST_DESTINATION.STYLE
        },
        new CacheFirst({
            cacheName: CACHE_NAME.STYLE,
            plugins: [
                commonCacheablePlugin,
                new ExpirationPlugin({
                    maxEntries: 10
                })
            ]
        })
    )
