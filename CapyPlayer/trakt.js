// Trakt 组件
const WidgetMetadata = {
    id: "Trakt_Pro",
    title: "Trakt 影视助手",
    description: "同步 Trakt 的在看、想看、追剧日历及个性化推荐数据。",
    author: "dlwlrma",
    site: "https://github.com/**",
    version: "1.1.0",
    requiredVersion: "0.0.1",
    modules: [
        {
            title: "Trakt 我看",
            functionName: "loadInterestItems",
            cacheDuration: 3600,
            params: [
                { name: "user_name", title: "用户名", type: "input", description: "Trakt 用户 ID" },
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
        },
        {
            title: "Trakt 个性化推荐",
            functionName: "loadSuggestionItems",
            cacheDuration: 43200,
            params: [
                { name: "cookie", title: "Cookie", type: "input" },
                {
                    name: "type",
                    title: "类别",
                    type: "enumeration",
                    enumOptions: [
                        { title: "电影", value: "movies" },
                        { title: "电视", value: "shows" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        },
        {
            title: "Trakt 追剧日历",
            functionName: "loadCalendarItems",
            cacheDuration: 43200,
            params: [
                { name: "cookie", title: "Cookie", type: "input" },
                { name: "days", title: "天数", type: "input", description: "获取未来几天的节目 (如 7)" },
                {
                    name: "order",
                    title: "排序",
                    type: "enumeration",
                    enumOptions: [
                        { title: "日期升序", value: "asc" },
                        { title: "日期降序", value: "desc" }
                    ]
                }
            ]
        }
    ]
};

// --- 通用工具函数 ---

/**
 * 从 Trakt 详情页链接中提取 ID
 * 适配 CapyPlayer 的 id & type 规范
 */
async function resolveMediaIds(traktUrls, cookie) {
    if (!traktUrls.length) return [];
    
    const headers = { 
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
    };

    const tasks = traktUrls.map(async (url) => {
        try {
            const res = await Widget.http.get(url, { headers });
            const docId = Widget.dom.parse(res.data);
            
            // 1. 优先提取 IMDb ID
            const imdbEl = Widget.dom.select(docId, "a#external-link-imdb")[0];
            if (imdbEl) {
                const href = Widget.dom.attr(imdbEl, "href");
                const match = href.match(/title\/(tt\d+)/);
                if (match) return { id: match[1], type: "imdb" };
            }

            // 2. 备选提取 TMDB ID
            const tmdbEl = Widget.dom.select(docId, "a#external-link-tmdb")[0];
            if (tmdbEl) {
                const href = Widget.dom.attr(tmdbEl, "href");
                const match = href.match(/(movie|tv)\/(\d+)/);
                if (match) return { 
                    id: match[2], 
                    type: match[1] === "movie" ? "tmdb" : "tmdb_tv" 
                };
            }
        } catch (e) {
            return null;
        }
        return null;
    });

    return (await Promise.all(tasks)).filter(Boolean);
}

// --- 模块逻辑实现 ---

async function loadInterestItems(params) {
    const { user_name, cookie, status, page = 1 } = params;
    const url = `https://trakt.tv/users/${user_name}/${status}?page=${page}`;
    
    const res = await Widget.http.get(url, { headers: { Cookie: cookie } });
    const docId = Widget.dom.parse(res.data);
    let urls = [];

    if (status === "progress") {
        // 在看列表解析：过滤掉进度 100% 的
        const items = Widget.dom.select(docId, "div.main-info");
        urls = items.map(el => {
            const progressEl = Widget.dom.select(el, "div.progress.ticks")[0];
            const progress = progressEl ? parseInt(Widget.dom.attr(progressEl, "aria-valuenow") || "0") : 0;
            const linkEl = Widget.dom.select(el, 'a[href^="/shows/"]')[0];
            return (progress < 100 && linkEl) ? `https://trakt.tv${Widget.dom.attr(linkEl, "href")}` : null;
        }).filter(Boolean);
    } else {
        // 其他列表解析：通过 meta 标签提取链接
        const metaEls = Widget.dom.select(docId, 'meta[content^="https://trakt.tv/"]');
        urls = [...new Set(metaEls.map(el => Widget.dom.attr(el, "content")))];
    }

    return await resolveMediaIds(urls, cookie);
}

async function loadSuggestionItems(params) {
    const { cookie, type, page = 1 } = params;
    const url = `https://trakt.tv/${type}/recommendations?page=${page}`;
    
    const res = await Widget.http.get(url, { headers: { Cookie: cookie } });
    const docId = Widget.dom.parse(res.data);
    const metaEls = Widget.dom.select(docId, 'meta[content^="https://trakt.tv/"]');
    const urls = [...new Set(metaEls.map(el => Widget.dom.attr(el, "content")))];

    return await resolveMediaIds(urls, cookie);
}

async function loadCalendarItems(params) {
    const { cookie, days = "7", order = "asc" } = params;
    const today = new Date().toISOString().split('T')[0];
    const url = `https://trakt.tv/calendars/my/shows-movies/${today}/${days}`;

    const res = await Widget.http.get(url, { headers: { Cookie: cookie } });
    const docId = Widget.dom.parse(res.data);
    const metaEls = Widget.dom.select(docId, 'meta[content^="https://trakt.tv/"]');
    let urls = [...new Set(metaEls.map(el => Widget.dom.attr(el, "content")))];

    if (order === "desc") urls.reverse();

    return await resolveMediaIds(urls, cookie);
}