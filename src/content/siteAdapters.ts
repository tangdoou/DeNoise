import { TabDomSkeleton } from '../shared/types';

export interface FeedCardInfo {
  title: string;
  snippet?: string;
  url?: string;
}

export interface SiteAdapter {
  id: string;
  name: string;
  match: (hostname: string, pathname: string) => boolean;
  hardNoiseCss: string;
  hardNoiseCountSelectors: string[];
  cardSelectors: string[];
  extractCardInfo: (el: HTMLElement) => FeedCardInfo | null;
  onEnable?: () => (() => void) | void;
}

function cleanText(raw: string | null | undefined, maxLen = 200): string {
  if (!raw) return '';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLen) return collapsed;
  return collapsed.slice(0, maxLen).trim();
}

function resolveHref(el: HTMLElement): string | undefined {
  const anchor =
    el.tagName === 'A'
      ? (el as HTMLAnchorElement)
      : (el.querySelector('a[href]') as HTMLAnchorElement | null);
  if (!anchor) return undefined;
  const rawHref = anchor.getAttribute('href');
  if (!rawHref || rawHref.startsWith('javascript:') || rawHref === '#') {
    return undefined;
  }
  try {
    return new URL(rawHref, window.location.href).href;
  } catch {
    return undefined;
  }
}

function queryFirstText(root: HTMLElement, selectors: string[], maxLen = 140): string {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    if (!node) continue;
    const attrTitle = node.getAttribute('title');
    const text = cleanText(node.textContent || attrTitle, maxLen);
    if (text.length >= 2) return text;
  }
  return '';
}

function setupBilibiliCommentShield(): () => void {
  const TOGGLE_ID = 'denoise-bili-comment-toggle';
  const HIDDEN_ATTR = 'data-denoise-comment-muted';
  let userExpanded = false;
  let observer: MutationObserver | null = null;

  const isVideoPage = () => {
    const path = window.location.pathname;
    return (
      path.startsWith('/video/') ||
      path.startsWith('/bangumi/play/') ||
      path.startsWith('/list/')
    );
  };

  const findCommentContainer = (): HTMLElement | null => {
    return (
      (document.querySelector('#commentapp') as HTMLElement | null) ||
      (document.querySelector('#comment') as HTMLElement | null) ||
      (document.querySelector('bili-comments') as HTMLElement | null)
    );
  };

  const syncState = () => {
    const target = findCommentContainer();
    const bar = document.getElementById(TOGGLE_ID);
    if (!target || !bar) return;

    if (userExpanded) {
      target.removeAttribute(HIDDEN_ATTR);
      target.style.display = '';
      bar.textContent = '💬 评论区已临时展开（点击可重新由 DeNoise 静音）';
    } else {
      target.setAttribute(HIDDEN_ATTR, 'true');
      target.style.display = 'none';
      bar.textContent = '💬 评论区已由 DeNoise 静音（点击可临时展开）';
    }
  };

  const ensureCommentToggle = () => {
    if (!isVideoPage()) {
      const stale = document.getElementById(TOGGLE_ID);
      if (stale) stale.remove();
      return;
    }

    const container = findCommentContainer();
    if (!container || !container.parentElement) return;

    let toggleBar = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
    if (!toggleBar) {
      toggleBar = document.createElement('button');
      toggleBar.id = TOGGLE_ID;
      toggleBar.type = 'button';
      toggleBar.style.cssText = [
        'display: flex',
        'align-items: center',
        'justify-content: space-between',
        'width: 100%',
        'margin: 14px 0',
        'padding: 12px 16px',
        'background: #F7F7F5',
        'color: #191919',
        'border: 1px solid #E9E9E7',
        'border-radius: 8px',
        'font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        'font-size: 13px',
        'font-weight: 500',
        'cursor: pointer',
        'transition: background 0.2s ease, border-color 0.2s ease',
        'text-align: left'
      ].join(';');

      toggleBar.addEventListener('mouseenter', () => {
        if (toggleBar) {
          toggleBar.style.background = '#EFEFED';
          toggleBar.style.borderColor = '#191919';
        }
      });
      toggleBar.addEventListener('mouseleave', () => {
        if (toggleBar) {
          toggleBar.style.background = '#F7F7F5';
          toggleBar.style.borderColor = '#E9E9E7';
        }
      });

      toggleBar.addEventListener('click', () => {
        userExpanded = !userExpanded;
        syncState();
      });

      container.parentElement.insertBefore(toggleBar, container);
    }

    syncState();
  };

  ensureCommentToggle();

  observer = new MutationObserver(() => {
    ensureCommentToggle();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  return () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    const toggleBar = document.getElementById(TOGGLE_ID);
    if (toggleBar) toggleBar.remove();

    const mutedNodes = document.querySelectorAll(`[${HIDDEN_ATTR}="true"]`);
    mutedNodes.forEach((node) => {
      const htmlEl = node as HTMLElement;
      htmlEl.removeAttribute(HIDDEN_ATTR);
      htmlEl.style.display = '';
    });
  };
}

const bilibiliAdapter: SiteAdapter = {
  id: 'bilibili',
  name: 'Bilibili',
  match: (hostname) => hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com'),
  hardNoiseCss: `
    .trending,
    .search-panel .trending,
    .bili-header .trending,
    .hot-search,
    .recommended-swipe,
    .floor-single-card,
    .ad-report,
    .video-card-ad-small,
    .pop-live-small-mode,
    .live-card,
    .bili-live-card,
    .eva-banner,
    .banner-card,
    .ad-floor-exp,
    .vcd,
    #activity_vote,
    .activity-m-v1,
    .video-page-game-card-small,
    .video-page-special-card-small,
    .bili-dyn-live-users,
    .right-entry--vip,
    .slide-ad-exp,
    #right-bottom-banner,
    [class*="ad-floor"] {
      display: none !important;
    }
  `,
  hardNoiseCountSelectors: [
    '.trending',
    '.recommended-swipe',
    '.floor-single-card',
    '.ad-report',
    '.video-card-ad-small',
    '.pop-live-small-mode',
    '.bili-live-card',
    '.eva-banner',
    '.banner-card',
    '.ad-floor-exp',
    '.video-page-game-card-small',
    '.slide-ad-exp',
    '#right-bottom-banner',
    '#comment',
    '#commentapp',
    'bili-comments'
  ],
  cardSelectors: [
    '.bili-video-card',
    '.video-page-card-small',
    '.rec-list .video-card',
    '.video-page-operator-card-small',
    '.bili-feed-card'
  ],
  extractCardInfo: (el) => {
    const title = queryFirstText(el, [
      '.bili-video-card__info--tit',
      '.bili-video-card__info--tit a',
      '.info .title',
      'p.title',
      'a.title',
      'a[title]',
      'h3'
    ]);
    if (!title) return null;
    const author = queryFirstText(el, [
      '.bili-video-card__info--author',
      '.upname',
      '.name',
      '.bili-video-card__info--bottom'
    ]);
    return {
      title,
      snippet: author || undefined,
      url: resolveHref(el)
    };
  },
  onEnable: setupBilibiliCommentShield
};

const zhihuAdapter: SiteAdapter = {
  id: 'zhihu',
  name: 'Zhihu',
  match: (hostname) => hostname === 'zhihu.com' || hostname.endsWith('.zhihu.com'),
  hardNoiseCss: `
    .GlobalSideBar,
    .Question-sideColumn,
    .SearchSideBar,
    .Pc-card,
    .Pc-Business-Card-PcTopFeedBanner,
    .Pc-feedAd-container,
    .TopstoryItem--advertCard,
    .HotList-item,
    .LoginBanner,
    .signFlowModal,
    .BottomActions-download,
    [class*="AdblockBanner"],
    [class*="DownloadApp"],
    [class*="Yanxuan"],
    .Card.GlobalSideBar-navList {
      display: none !important;
    }

    .Topstory-container,
    .Question-main,
    .Search-container {
      justify-content: center !important;
    }
    .Topstory-mainColumn,
    .Question-mainColumn,
    .SearchMain {
      width: min(920px, 94vw) !important;
      max-width: 920px !important;
      margin-left: auto !important;
      margin-right: auto !important;
      flex: 1 1 auto !important;
    }
  `,
  hardNoiseCountSelectors: [
    '.GlobalSideBar',
    '.Question-sideColumn',
    '.SearchSideBar',
    '.Pc-card',
    '.Pc-feedAd-container',
    '.TopstoryItem--advertCard',
    '.LoginBanner'
  ],
  cardSelectors: ['.TopstoryItem', '.SearchResult-Card', '.List-item'],
  extractCardInfo: (el) => {
    const title = queryFirstText(el, [
      '.ContentItem-title',
      'h2.ContentItem-title a',
      'h2 a',
      'h2'
    ]);
    const snippet = queryFirstText(
      el,
      ['.RichContent-inner', '.CopyrightRichText-richText', '.SearchItem-meta'],
      180
    );
    if (!title && !snippet) return null;
    return {
      title: title || snippet.slice(0, 60),
      snippet: snippet || undefined,
      url: resolveHref(el)
    };
  }
};

const csdnAdapter: SiteAdapter = {
  id: 'csdn',
  name: 'CSDN',
  match: (hostname) => hostname === 'csdn.net' || hostname.endsWith('.csdn.net'),
  hardNoiseCss: `
    .blog_container_aside,
    #rightAside,
    .csdn-side-toolbar,
    .recommend-right,
    .more-toolbox-new,
    .left-toolbox,
    .pulllog-box,
    .passport-login-container,
    .passport-login-mark,
    .login-mark,
    .tool-active-list,
    .recommend-ad-box,
    .mediav_ad,
    .ad-box,
    [id*="dmp_ad"],
    .bottom-pub-footer,
    .hide-article-box,
    .hide-preCode-box,
    .hljs-button.signin,
    .opt-box {
      display: none !important;
    }

    pre,
    pre.set-code-hide,
    code,
    #article_content,
    .article_content,
    .markdown_views pre {
      max-height: none !important;
      height: auto !important;
      overflow-y: visible !important;
    }

    .main_father .container,
    #mainBox {
      width: min(980px, 94vw) !important;
      margin: 0 auto !important;
      display: flex !important;
      justify-content: center !important;
    }
    #mainBox main,
    .nodata .container main {
      width: 100% !important;
      max-width: 960px !important;
      float: none !important;
      margin: 0 auto !important;
    }
  `,
  hardNoiseCountSelectors: [
    '.blog_container_aside',
    '#rightAside',
    '.csdn-side-toolbar',
    '.recommend-right',
    '.more-toolbox-new',
    '.left-toolbox',
    '.pulllog-box',
    '.recommend-ad-box',
    '.passport-login-container'
  ],
  cardSelectors: ['.recommend-item-box'],
  extractCardInfo: (el) => {
    const title = queryFirstText(el, ['h4', '.title', 'a[title]', '.tit']);
    if (!title) return null;
    const snippet = queryFirstText(el, ['.content', '.desc', 'p.content'], 160);
    return {
      title,
      snippet: snippet || undefined,
      url: resolveHref(el)
    };
  }
};

const xiaohongshuAdapter: SiteAdapter = {
  id: 'xiaohongshu',
  name: 'Xiaohongshu',
  match: (hostname) =>
    hostname === 'xiaohongshu.com' || hostname.endsWith('.xiaohongshu.com'),
  hardNoiseCss: `
    .download-banner,
    .login-banner,
    .floating-btn-sets,
    [class*="download-guide"],
    [class*="app-download"] {
      display: none !important;
    }
  `,
  hardNoiseCountSelectors: [
    '.download-banner',
    '.login-banner',
    '.floating-btn-sets'
  ],
  cardSelectors: ['.note-item', 'section.note-item'],
  extractCardInfo: (el) => {
    const title = queryFirstText(el, ['.title', 'a.title', '.footer span']);
    const imgAlt = cleanText(el.querySelector('img')?.getAttribute('alt'), 100);
    const author = queryFirstText(el, ['.author-wrapper .name', '.name']);
    const finalTitle = title || imgAlt;
    if (!finalTitle) return null;
    return {
      title: finalTitle,
      snippet: author || undefined,
      url: resolveHref(el)
    };
  }
};

const baiduAdapter: SiteAdapter = {
  id: 'baidu',
  name: 'Baidu',
  match: (hostname) => hostname === 'baidu.com' || hostname.endsWith('.baidu.com'),
  hardNoiseCss: `
    #content_right,
    #con-ar,
    .cr-offset,
    #s-hotsearch-wrapper,
    .s-hotsearch-wrapper,
    .hot-refresh-wrapper,
    .c-recomm-wrap,
    [tpl="right_toplist1"],
    [data-module="hotsearch"],
    .EC_result,
    .ec_wise_ad {
      display: none !important;
    }
  `,
  hardNoiseCountSelectors: [
    '#content_right',
    '#s-hotsearch-wrapper',
    '.s-hotsearch-wrapper',
    '.EC_result'
  ],
  cardSelectors: ['.result', '.result-op'],
  extractCardInfo: (el) => {
    const title = queryFirstText(el, ['h3 a', 'h3', '.c-title']);
    if (!title) return null;
    const snippet = queryFirstText(
      el,
      ['.c-abstract', '[class*="content-right"]', '.c-span-last', 'p'],
      160
    );
    return {
      title,
      snippet: snippet || undefined,
      url: resolveHref(el)
    };
  }
};

const bingAdapter: SiteAdapter = {
  id: 'bing',
  name: 'Bing',
  match: (hostname) => hostname === 'bing.com' || hostname.endsWith('.bing.com'),
  hardNoiseCss: `
    .b_ad,
    .b_adLastChild,
    .sb_add,
    .carousel_container,
    #b_context .b_ans:has([class*="trend"]) {
      display: none !important;
    }
  `,
  hardNoiseCountSelectors: ['.b_ad', '.b_adLastChild', '.carousel_container'],
  cardSelectors: ['.b_algo'],
  extractCardInfo: (el) => {
    const title = queryFirstText(el, ['h2 a', 'h2']);
    if (!title) return null;
    const snippet = queryFirstText(el, ['.b_caption p', '.b_lineclamp2', 'p'], 160);
    return {
      title,
      snippet: snippet || undefined,
      url: resolveHref(el)
    };
  }
};

const genericAdapter: SiteAdapter = {
  id: 'generic',
  name: 'Generic Web',
  match: () => true,
  hardNoiseCss: `
    aside[class*="hot"],
    aside[class*="rank"],
    aside[class*="trend"],
    [class*="hot-list"],
    [class*="hotsearch"],
    [class*="trending-list"],
    [class*="ad-banner"],
    [id*="ad-banner"] {
      display: none !important;
    }
  `,
  hardNoiseCountSelectors: [
    'aside[class*="hot"]',
    'aside[class*="rank"]',
    'aside[class*="trend"]',
    '[class*="hot-list"]',
    '[class*="hotsearch"]',
    '[class*="ad-banner"]'
  ],
  cardSelectors: [
    'article',
    '[class*="recommend"]',
    '[class*="feed-item"]',
    '[class*="card"]'
  ],
  extractCardInfo: (el) => {
    const tag = el.tagName.toLowerCase();
    if (['main', 'body', 'header', 'footer', 'nav', 'form'].includes(tag)) {
      return null;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 140 || rect.height < 64 || rect.height > 880) {
      return null;
    }
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    if (rect.width * rect.height > viewportArea * 0.62) {
      return null;
    }
    const url = resolveHref(el);
    if (!url) return null;

    const title = queryFirstText(el, [
      'h1',
      'h2',
      'h3',
      'h4',
      '[class*="title"]',
      'a[title]',
      'a[href]'
    ]);
    if (!title || title.length < 4) return null;

    const snippet = queryFirstText(el, ['p', '[class*="desc"]', '[class*="summary"]'], 150);
    return {
      title,
      snippet: snippet && snippet !== title ? snippet : undefined,
      url
    };
  }
};

const SITE_ADAPTERS: SiteAdapter[] = [
  bilibiliAdapter,
  zhihuAdapter,
  csdnAdapter,
  xiaohongshuAdapter,
  baiduAdapter,
  bingAdapter,
  genericAdapter
];

export function resolveSiteAdapter(
  hostname = window.location.hostname,
  pathname = window.location.pathname
): SiteAdapter {
  const normalizedHost = hostname.toLowerCase();
  for (const adapter of SITE_ADAPTERS) {
    if (adapter.match(normalizedHost, pathname)) {
      return adapter;
    }
  }
  return genericAdapter;
}

export function extractCurrentPageDomSkeleton(tabId = 0): TabDomSkeleton {
  const url = window.location.href;
  const title = cleanText(document.title, 200);

  const metaDescEl =
    (document.querySelector('meta[name="description"]') as HTMLMetaElement | null) ||
    (document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null);
  const metaDescription = cleanText(metaDescEl?.content, 240);

  const headingSet = new Set<string>();
  const headingNodes = document.querySelectorAll('h1, h2, h3');
  for (let idx = 0; idx < headingNodes.length && headingSet.size < 8; idx += 1) {
    const node = headingNodes[idx] as HTMLElement;
    if (node.closest('#denoise-shadow-host')) continue;
    const text = cleanText(node.textContent, 120);
    if (text.length >= 2) {
      headingSet.add(text);
    }
  }

  const primaryContentEl =
    (document.querySelector('article') as HTMLElement | null) ||
    (document.querySelector('main') as HTMLElement | null) ||
    (document.querySelector('[role="main"]') as HTMLElement | null) ||
    (document.querySelector('#article_content') as HTMLElement | null) ||
    (document.querySelector('.RichContent-inner') as HTMLElement | null) ||
    (document.querySelector('.video-info-container') as HTMLElement | null) ||
    document.body;

  const mainTextSnippet = cleanText(
    primaryContentEl?.innerText || primaryContentEl?.textContent || '',
    300
  );

  const mediaAltSet = new Set<string>();
  const videoTitleNodes = document.querySelectorAll(
    'h1.video-title, .video-title, video[title], [class*="player-title"]'
  );
  for (let idx = 0; idx < videoTitleNodes.length && mediaAltSet.size < 8; idx += 1) {
    const node = videoTitleNodes[idx] as HTMLElement;
    const text = cleanText(node.getAttribute('title') || node.textContent, 100);
    if (text.length >= 3) mediaAltSet.add(text);
  }

  const imgNodes = document.querySelectorAll('img[alt]');
  for (let idx = 0; idx < imgNodes.length && mediaAltSet.size < 8; idx += 1) {
    const img = imgNodes[idx] as HTMLImageElement;
    if (img.closest('#denoise-shadow-host')) continue;
    const alt = cleanText(img.getAttribute('alt'), 100);
    if (alt.length >= 3) {
      mediaAltSet.add(alt);
    }
  }

  return {
    tabId,
    url,
    title,
    metaDescription,
    headings: Array.from(headingSet),
    mainTextSnippet,
    mediaAlts: Array.from(mediaAltSet)
  };
}
