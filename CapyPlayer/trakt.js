// Trakt 组件 - 性能优化稳定版
const WidgetMetadata = {
    id: "Trakt_Optimized",
    title: "Trakt 我看",
    description: "同步 Trakt 数据。已优化加载速度，解决 30s 超时问题。",
    author: "dlwlrma",
    site: "https://github.com/L-strawberry/TM_js/CapyPlayer",
    version: "1.1.2",
    requiredVersion: "0.0.1",
    modules: [
        {
            title: "Trakt 我看",
            functionName: "loadInterestItems",
            cacheDuration: 3600,
            params: [
                { name: "user_name", title: "用户名", type: "input" },
                { name: "cookie", title: "Cookie", type: "input", description: "_traktsession=xxxx" },
                {
                    name: "status",
                    title: "状态",
                    type: "enumeration",
                    enumOptions: [
                        { title: "想看 (Watchlist)", value: "watchlist" },
                        { title: "在看 (Progress)", value: "progress" },
                        { title: "看过-电影", value: "history/movies/added/asc" },
                        { title: "看过-电视", value: "history/shows/added/asc" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
        // 其他模块以此类推...
    ]
};

// --- 高性能解析工具 ---

async function resolveMediaIds(traktUrls, cookie) {
    // 限制单次解析数量（例如前 12 个），防止请求过多导致 30s 超时
    const limitedUrls = traktUrls.slice(0, 12);
    if (limitedUrls.length === 0) return [];
    
    const headers = { 
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    };

    const tasks = limitedUrls.map(async (url) => {
        try {
            // 为单次详情页请求设置 5s 超时
            const res = await Widget.http.get(url, { headers, timeout: 5000 });
            const docId = Widget.dom.parse(res.data);
            
            // 优先匹配 IMDb
            const imdbEl = Widget.dom.select(docId, "a#external-link-imdb")[0];
            if (imdbEl) {
                const href = Widget.dom.attr(imdbEl, "href");
                const match = href.match(/title\/(tt\d+)/);
                if (match) return { id: match[1], type: "imdb" };
            }

            // 备选匹配 TMDB
            const tmdbEl = Widget.dom.select(docId, "a#external-link-tmdb")[0];
            if (tmdbEl) {
                const href = Widget.dom.attr(tmdbEl, "href");
                const match = href.match(/(movie|tv)\/(\d+)/);
                if (match) return { id: match[2], type: match[1] === "movie" ? "tmdb" : "tmdb_tv" };
            }
        } catch (e) {
            console.log(`解析失败 [${url}]: ${e.message}`);
        }
        return null;
    });

    // 并发执行所有解析任务
    const results = await Promise.all(tasks);
    return results.filter(Boolean);
}

// --- 模块核心逻辑 ---

async function loadInterestItems(params) {
    const { user_name, cookie, status, page = 1 } = params;
    if (!user_name || !cookie) throw new Error("请填写用户名和 Cookie");

    // 注意：Trakt 网页版的 progress 路径与其他状态不同
    const path = status === "progress" ? "progress" : status;
    const url = `https://trakt.tv/users/${user_name}/${path}?page=${page}`;
    
    const res = await Widget.http.get(url, { headers: { Cookie: cookie }, timeout: 10000 });
    const docId = Widget.dom.parse(res.data);
    let urls = [];

    if (status === "progress") {
        // 在看列表解析
        const items = Widget.dom.select(docId, "div.main-info");
        urls = items.map(el => {
            const progressEl = Widget.dom.select(el, "div.progress.ticks")[0];
            const progress = progressEl ? parseInt(Widget.dom.attr(progressEl, "aria-valuenow") || "0") : 0;
            const linkEl = Widget.dom.select(el, 'a[href^="/shows/"]')[0];
            // 过滤掉已完成 (100%) 的剧集
            return (progress < 100 && linkEl) ? `https://trakt.tv${Widget.dom.attr(linkEl, "href")}` : null;
        }).filter(Boolean);
    } else {
        // 其他列表解析
        const metaEls = Widget.dom.select(docId, 'meta[content^="https://trakt.tv/"]');
        urls = [...new Set(metaEls.map(el => Widget.dom.attr(el, "content")))];
    }

    // 执行并发解析 ID
    return await resolveMediaIds(urls, cookie);
}
