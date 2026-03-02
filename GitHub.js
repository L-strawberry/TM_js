// ==UserScript==
// @name            Github & Gist Link, Download & Copy
// @description:zh-CN 兼容新版 UI：GitHub 提供 Raw/下载；Gist 提供复制最新链接、下载及内容抓取。支持跨域下载。
// @version           2.0
// @author            iulee
// @match             https://github.com/*
// @match             https://gist.github.com/*
// @icon              https://github.githubassets.com/favicons/favicon.svg
// @grant             GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const scanInterval = 1.5;

    // --- 通用工具 ---

    function isPrivateRepo() {
        const privateLabel = document.querySelector('span.Label--secondary, .Label--attention, .Label');
        if (privateLabel) {
            const text = privateLabel.innerText.toLowerCase();
            return text.includes('private') || text.includes('私有');
        }
        return false;
    }

    /**
     * GitHub 获取 Raw 链接逻辑
     */
    function getSmartRawUrl(githubUrl) {
        try {
            let url = new URL(githubUrl);
            let pathParts = url.pathname.split('/');
            if (pathParts[3] === 'blob') {
                if (isPrivateRepo()) {
                    pathParts[3] = 'raw';
                    url.pathname = pathParts.join('/');
                } else {
                    pathParts.splice(3, 1);
                    url.hostname = 'raw.githubusercontent.com';
                    url.pathname = pathParts.join('/');
                }
                return url.toString();
            }
        } catch (e) { return githubUrl; }
        return githubUrl;
    }

    /**
     * Gist 获取去掉 Commit ID 的最新 Raw 链接
     * 原本格式: /raw/COMMIT_ID/filename -> 转换后: /raw/filename (即最新版)
     */
    function getLatestGistRawUrl(rawUrl) {
        try {
            const url = new URL(rawUrl);
            const parts = url.pathname.split('/');
            // Gist Raw 路径通常是 /username/id/raw/commit_id/file
            // 我们去掉 commit_id 这一层实现指向最新版本
            if (parts.includes('raw')) {
                const rawIndex = parts.indexOf('raw');
                if (parts.length > rawIndex + 1) {
                    parts.splice(rawIndex + 1, 1); 
                    url.pathname = parts.join('/');
                }
            }
            return url.toString();
        } catch (e) { return rawUrl; }
    }

    async function copyToClipboard(text, btnElement) {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            const originalHtml = btnElement.innerHTML;
            btnElement.innerHTML = `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" fill="#28a745"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"></path></svg>`;
            setTimeout(() => btnElement.innerHTML = originalHtml, 2000);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    }

    function createIconBtn(title, svgHtml, onClick) {
        const div = document.createElement('div');
        div.className = 'btn-octicon'; // 使用 GitHub 原生样式类
        div.style.cssText = 'cursor:pointer; display:inline-flex; align-items:center; transition: color 0.2s; padding: 4px;';
        div.title = title;
        div.innerHTML = svgHtml;
        if (onClick) div.onclick = onClick;
        return div;
    }

    // 使用 GM_xmlhttpRequest 解决跨域并强制下载文件
    const downloadFile = (url) => {
        const fileName = decodeURIComponent(url.split('/').pop().split('?')[0]);
        
        if (typeof GM_xmlhttpRequest !== 'undefined') {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                onload: function(response) {
                    const blob = response.response;
                    const a = document.createElement('a');
                    a.href = window.URL.createObjectURL(blob);
                    a.download = fileName;
                    a.click();
                    window.URL.revokeObjectURL(a.href);
                },
                onerror: function() {
                    window.open(url, '_blank');
                }
            });
        } else {
            fetch(url).then(r => r.blob()).then(blob => {
                const a = document.createElement('a');
                a.href = window.URL.createObjectURL(blob);
                a.download = fileName;
                a.click();
            }).catch(() => window.open(url, '_blank'));
        }
    };

    // --- GitHub 仓库逻辑 ---

    const scanGitHub = () => {
        const rows = document.querySelectorAll('[role="row"].Box-row, tr.js-navigation-item, .react-directory-filename-column');
        rows.forEach(row => {
            if (row.hasAttribute('data-raw-btn-ready')) return;
            const link = row.querySelector('a[href*="/blob/"]');
            if (!link) return;

            const rawUrl = getSmartRawUrl(link.href);
            let container = row.querySelector('.react-directory-row-cell:last-child') || row.querySelector('td:last-child') || row;

            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'display:inline-flex; align-items:center; gap:8px; margin-left:12px; vertical-align:middle;';

            const copyBtn = createIconBtn('Copy Raw URL', `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"></path></svg>`, (e) => {
                e.preventDefault();
                copyToClipboard(rawUrl, copyBtn);
            });
            
            const downBtn = createIconBtn('Download File', `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M1.75 14.25A1.75 1.75 0 013.5 12.5h9a1.75 1.75 0 011.75 1.75v1.5a.75.75 0 01-.75.75H2.5a.75.75 0 01-.75-.75v-1.5zM10.75 9.25a.25.25 0 01.25.25v2.5a.25.25 0 01-.25.25H5.25a.25.25 0 01-.25-.25v-2.5a.25.25 0 01.25-.25h5.5zM8 1.75a.25.25 0 01.25.25v7.5a.25.25 0 01-.25.25H6.75a.25.25 0 01-.25-.25v-7.5a.25.25 0 01.25-.25h1.5zM10.25 5.25l1.5 1.5a.25.25 0 01.35 0l3-3a.25.25 0 00-.35-.35L11 5.25 9.25 3.5a.25.25 0 00-.35.35z"></path></svg>`, (e) => {
                e.preventDefault();
                downloadFile(rawUrl);
            });

            btnGroup.appendChild(copyBtn);
            btnGroup.appendChild(downBtn);
            container.appendChild(btnGroup);
            row.setAttribute('data-raw-btn-ready', 'true');
        });
    };

    // --- Gist 逻辑 ---

    const scanGist = () => {
        const containers = document.querySelectorAll('.gist-file-container, .file');
        containers.forEach(container => {
            if (container.hasAttribute('data-gist-enhanced-ready')) return;

            const header = container.querySelector('.file-header');
            const actions = container.querySelector('.file-actions');
            if (!header || !actions) return;

            // 查找 Gist 原始的 Raw 按钮获取基础链接
            const rawLinkAnchor = header.querySelector('a[href*="/raw/"]');
            if (!rawLinkAnchor) return;

            const baseRawUrl = rawLinkAnchor.href;
            const latestRawUrl = getLatestGistRawUrl(baseRawUrl);

            const btnGroup = document.createElement('div');
            btnGroup.className = 'gist-enhanced-group';
            btnGroup.style.cssText = 'display:inline-flex; align-items:center; gap:4px; margin-right:8px; vertical-align:middle;';
            
            // 按钮 1: 复制最新 Raw 链接
            const copyLinkBtn = createIconBtn('Copy Latest Raw URL', `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z"></path></svg>`, (e) => {
                e.preventDefault();
                copyToClipboard(latestRawUrl, copyLinkBtn);
            });

            // 按钮 2: 直接下载该文件 (最新版)
            const downBtn = createIconBtn('Download This File (Latest)', `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M1.75 14.25A1.75 1.75 0 013.5 12.5h9a1.75 1.75 0 011.75 1.75v1.5a.75.75 0 01-.75.75H2.5a.75.75 0 01-.75-.75v-1.5zM10.75 9.25a.25.25 0 01.25.25v2.5a.25.25 0 01-.25.25H5.25a.25.25 0 01-.25-.25v-2.5a.25.25 0 01.25-.25h5.5zM8 1.75a.25.25 0 01.25.25v7.5a.25.25 0 01-.25.25H6.75a.25.25 0 01-.25-.25v-7.5a.25.25 0 01.25-.25h1.5zM10.25 5.25l1.5 1.5a.25.25 0 01.35 0l3-3a.25.25 0 00-.35-.35L11 5.25 9.25 3.5a.25.25 0 00-.35.35z"></path></svg>`, (e) => {
                e.preventDefault();
                downloadFile(latestRawUrl);
            });
            
            // 按钮 3: 复制内容
            const copyContentBtn = createIconBtn('Copy File Content', `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"></path></svg>`, async (e) => {
                e.preventDefault();
                const textArea = container.querySelector('.blob-wrapper table, .blob-wrapper pre');
                if (textArea) {
                    copyToClipboard(textArea.innerText, copyContentBtn);
                } else {
                    try {
                        const response = await fetch(latestRawUrl);
                        const text = await response.text();
                        copyToClipboard(text, copyContentBtn);
                    } catch (err) { window.open(latestRawUrl, '_blank'); }
                }
            });

            btnGroup.appendChild(copyLinkBtn);
            btnGroup.appendChild(downBtn);
            btnGroup.appendChild(copyContentBtn);
            
            // 插入到现有操作按钮的最前面
            actions.insertBefore(btnGroup, actions.firstChild);
            container.setAttribute('data-gist-enhanced-ready', 'true');
        });
    };

    const mainTask = () => {
        const hostname = window.location.hostname;
        if (hostname === 'gist.github.com') {
            scanGist();
        } else if (hostname === 'github.com') {
            scanGitHub();
        }
    };

    setInterval(mainTask, scanInterval * 1000);
    mainTask();

})();
