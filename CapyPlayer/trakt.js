/**
 * Trakt 插件 for CapyPlayer
 * 功能：同步“想看/在看”、个人推荐、自定义片单、追剧日历
 * 优化：解决网络请求超时，增强 ID 匹配
 */

const WidgetMetadata = {
    id: "Trakt_Final",
    title: "Trakt 影视助手",
    description: "解析 Trakt 想看、在看、片单、追剧日历及个性化推荐。建议填写 Cookie 以获取完整体验。",
    author: "dlwlrma",
    site: "https://github.com/L-strawberry/TM_js/CapyPlayer",
    version: "1.2.0",
    requiredVersion: "0.0.1",
    modules: [
        {
            title: "Trakt 我看",
            functionName: "loadInterestItems",
            cacheDuration: 3600,
            params: [
                { name: "user_name", title: "用户名", type: "input", description: "Trakt 用户 ID" },
                { name: "cookie", title: "用户 Cookie", type: "input", description: "_traktsession=xxxx" },
                {
                    name: "status",
                    title: "状态",
                    type: "enumeration",
                    enumOptions: [
                        { title: "想看", value: "watchlist" },
                        { title: "在看", value: "progress" },
                        { title: "看过-电影", value: "history/movies/added/asc" },
                        { title: "看过-电视", value: "history/shows/added/asc" },
                        { title: "随机想看", value: "random_watchlist" }
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
                { name: "cookie", title: "用户 Cookie", type: "input" },
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
            title: "Trakt 片单",
            functionName: "loadListItems",
            cacheDuration: 86400,
            params: [
                { name: "user_name", title: "用户名", type: "input" },
                { name: "list_name", title: "片单名", type: "input", description: "如：latest-4k-releases" },
                {
                    name: "sort_by",
                    title: "排序",
                    type: "enumeration",
                    enumOptions: [
                        { title: "排名", value: "rank" },
                        { title: "添加时间", value: "added" },
                        { title: "标题", value: "title" },
                        { title: "发布日期", value: "released" }
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
                { name: "cookie", title: "用户 Cookie", type: "input" },
                { name: "start_date", title: "偏移天数", type: "input", description: "0今天, -1昨天, 1明天" },
                { name: "days", title: "显示天数", type: "input", description: "通常填 7" }
            ]
        }
    ]
};

// --- 工具函数：解析详情页 ID ---

async function resolveIds(urls, cookie) {
    // 限制单次最大并发解析数，防止 30s 超时
    const limit = urls.slice(0, 15);
    const headers = {
        "Cookie": cookie || "",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    };

    const tasks = limit.map(async (url) => {
        try {
            // 单次详情请求超时设为 6 秒
            const res = await Widget.http.get(url, { headers, timeout: 6000 });
            const docId = Widget.dom.parse(res.data);

            // 1. 尝试 IMDb
            const imdbEl = Widget.dom.select(docId, "a#external-link-imdb")[0];
            if (imdbEl) {
                const href = Widget.dom.attr(imdbEl, "href");
                const match = href.match(/title\/(tt\d+)/);
                if (match) return { id: match[1], type: "imdb" };
            }

            // 2. 尝试 TMDB
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
            console.log("Resolve ID failed: " + url);
        }
        return null;
    });

    return (await Promise.all(tasks)).filter(Boolean);
}

// --- 模块逻辑 ---

async function loadInterestItems(params) {
    const { user_name, cookie, status, page = 1 } = params;
    if (!user_name) throw new Error("缺少用户名");

    let finalStatus = status === "random_watchlist" ? "watchlist" : status;
    const url = `https://trakt.tv/users/${user_name}/${finalStatus}?page=${page}`;
    
    const res = await Widget.http.get(url, { headers: { Cookie: cookie || "" } });
    const docId = Widget.dom.parse(res.data);
    let urls = [];

    if (status === "progress") {
        const items = Widget.dom.select(docId, "div.main-info");
        urls = items.map(el => {
            const progEl = Widget.dom.select(el, "div.progress.ticks")[0];
            const val = progEl ? parseInt(Widget.dom.attr(progEl, "aria-valuenow") || "0") : 0;
            const linkEl = Widget.dom.select(el, 'a[href^="/shows/"]')[0];
            return (val < 100 && linkEl) ? `https://trakt.tv${Widget.dom.attr(linkEl, "href")}` : null;
        }).filter(Boolean);
    } else {
        const metaEls = Widget.dom.select(docId, 'meta[content^="https://trakt.tv/"]');
        urls = metaEls.map(el => Widget.dom.attr(el, "content")).filter(u => u.includes('/movies/') || u.includes('/shows/'));
        urls = [...new Set(urls)];
        if (status === "random_watchlist") urls = urls.sort(() => 0.5 - Math.random());
    }

    return await resolveIds(urls, cookie);
}

async function loadSuggestionItems(params) {
    const { cookie, type, page = 1 } = params;
    const url = `https://trakt.tv/${type}/recommendations?page=${page}`;
    const res = await Widget.http.get(url, { headers: { Cookie: cookie || "" } });
    const docId = Widget.dom.parse(res.data);
    const metaEls = Widget.dom.select(docId, 'meta[content^="https://trakt.tv/"]');
    const urls = [...new Set(metaEls.map(el => Widget.dom.attr(el, "content")))];
    return await resolveIds(urls, cookie);
}

async function loadListItems(params) {
    const { user_name, list_name, sort_by = "rank", page = 1 } = params;
    if (!user_name || !list_name) throw new Error("缺少必要参数");

    // 使用 Trakt API 接口（更高效）
    const apiUrl = `https://hd.trakt.tv/users/${user_name}/lists/${list_name}/items/movie,show?page=${page}&limit=20&sort_by=${sort_by}`;
    const res = await Widget.http.get(apiUrl, {
        headers: { "trakt-api-key": "201dc70c5ec6af530f12f079ea1922733f6e1085ad7b02f36d8e011b75bcea7d" }
    });

    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    return data
        .filter(item => item[item.type]?.ids?.imdb)
        .map(item => ({ id: item[item.type].ids.imdb, type: "imdb" }));
}

async function loadCalendarItems(params) {
    const { cookie, start_date = "0", days = "7" } = params;
    const date = new Date();
    date.setDate(date.getDate() + parseInt(start_date));
    const dateStr = date.toISOString().split('T')[0];

    const url = `https://trakt.tv/calendars/my/shows-movies/${dateStr}/${days}`;
    const res = await Widget.http.get(url, { headers: { Cookie: cookie || "" } });
    const docId = Widget.dom.parse(res.data);
    const metaEls = Widget.dom.select(docId, 'meta[content^="https://trakt.tv/"]');
    const urls = [...new Set(metaEls.map(el => Widget.dom.attr(el, "content")))];
    return await resolveIds(urls, cookie);
}
