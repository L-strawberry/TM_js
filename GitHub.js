// ==UserScript==
// @name            Github & Gist Link, Download & Copy
// @description:zh-CN 兼容新版 UI：GitHub 提供 Raw/下载；Gist 提供复制最新链接及本地内容抓取，避开跨域拦截。
// @version           1.7
// @author            iulee
// @match             https://github.com/*
// @match             https://gist.github.com/*
// @icon              https://github.githubassets.com/favicons/favicon.svg
// @grant             none
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

    function getLatestGistRawUrl(rawUrl) {
        try {
            const url = new URL(rawUrl);
            const parts = url.pathname.split('/');
            if (parts[3] === 'raw' && parts.length > 5) {
                parts.splice(4, 1); 
                url.pathname = parts.join('/');
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
        div.style.cssText = 'cursor:pointer; display:inline-flex; align-items:center; color:var(--color-fg-muted); transition: color 0.2s;';
        div.onmouseover = () => div.style.color = 'var(--color-accent-fg)';
        div.onmouseout = () => div.style.color = 'var(--color-fg-muted)';
        div.title = title;
        div.innerHTML = svgHtml;
        if (onClick) div.onclick = onClick;
        return div;
    }

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
                const fileName = decodeURIComponent(rawUrl.split('/').pop().split('?')[0]);
                fetch(rawUrl).then(r => r.blob()).then(blob => {
                    const a = document.createElement('a');
                    a.href = window.URL.createObjectURL(blob);
                    a.download = fileName;
                    a.click();
                }).catch(() => window.open(rawUrl, '_blank'));
            });

            btnGroup.appendChild(copyBtn);
            btnGroup.appendChild(downBtn);
            container.appendChild(btnGroup);
            row.setAttribute('data-raw-btn-ready', 'true');
        });
    };

    // --- Gist 逻辑 ---

    const scanGist = () => {
        // 查找所有文件块
        const containers = document.querySelectorAll('.gist-file-container, .file');
        containers.forEach(container => {
            if (container.hasAttribute('data-gist-enhanced-ready')) return;

            const header = container.querySelector('.file-header');
            const actions = container.querySelector('.file-actions');
            if (!header || !actions) return;

            // 获取 Raw 链接
            const rawLinkAnchor = header.querySelector('a[href*="/raw/"]');
            if (!rawLinkAnchor) return;

            const baseRawUrl = rawLinkAnchor.href;
            const latestRawUrl = getLatestGistRawUrl(baseRawUrl);

            const btnGroup = document.createElement('div');
            btnGroup.className = 'gist-enhanced-group';
            btnGroup.style.cssText = 'display:inline-flex; align-items:center; gap:12px; margin-right:12px; vertical-align:middle;';
            
            // 按钮 1: 复制最新链接
            const copyLinkBtn = createIconBtn('Copy Latest Raw URL', `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z"></path></svg>`, (e) => {
                e.preventDefault();
                copyToClipboard(latestRawUrl, copyLinkBtn);
            });
            
            // 按钮 2: 复制内容 (尝试本地抓取 + fetch 备用)
            const copyContentBtn = createIconBtn('Copy Latest File Content', `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"></path></svg>`, async (e) => {
                e.preventDefault();
                
                // 方法 A: 尝试从当前页面容器直接抓取文本内容 (避开跨域且最快)
                const textArea = container.querySelector('.blob-wrapper table, .blob-wrapper pre');
                if (textArea) {
                    copyToClipboard(textArea.innerText, copyContentBtn);
                    return;
                }

                // 方法 B: 如果页面没渲染(例如太大), 则尝试 Fetch
                try {
                    const response = await fetch(latestRawUrl);
                    if (response.ok) {
                        const text = await response.text();
                        copyToClipboard(text, copyContentBtn);
                    } else {
                        // 如果 Fetch 失败 (由于跨域), 打开新窗口作为最后的兜底
                        window.open(latestRawUrl, '_blank');
                    }
                } catch (err) {
                    window.open(latestRawUrl, '_blank');
                }
            });

            btnGroup.appendChild(copyLinkBtn);
            btnGroup.appendChild(copyContentBtn);
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