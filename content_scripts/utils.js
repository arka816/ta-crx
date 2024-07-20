const DEFAULT_TIMEOUT = 60 * 1000;      // 1 minute
const DEFAULT_POLL_INTERVAL = 1000;     // 1 second
const DEFAULT_DYNAMIC_LOAD_TIME = 500;  // 0.5 second
const DEFAULT_MAX_SCROLL_REPEAT = 10;
const PLACES_PER_PAGE = 30;
const REVIEWS_PER_PAGE = 10;
const ALLOWED_HOMEPAGE_LOCATIONS = [
    'https://www.tripadvisor.in', 
    'https://www.tripadvisor.com'
]
const STATE_PATHNAME_VERIFIER_MAP = {
    2: function(){
        return window.location.pathname.toLowerCase() == '/search';
    },
    3: function(){
        return window.location.pathname.toLowerCase() == '/search';
    },
    4: function(){
        return window.location.pathname.endsWith('.html');
    }
}

function sleep(time){
    return new Promise(r => setTimeout(r, time));
}

async function wait(check, interval=DEFAULT_POLL_INTERVAL, timeout=DEFAULT_TIMEOUT, ...args){
    var start_time = Date.now();

    while((Date.now() - start_time) <= timeout){
        if(check(...args)) return true;
        await sleep(interval);
    }

    return check(...args);
}

function exists(selector){
    return document.querySelector(selector) !== null;
}

async function scrollToBottom(){
    var lastHeight = document.body.scrollHeight;
    var scrollCount = 0;

    while (scrollCount <= DEFAULT_MAX_SCROLL_REPEAT){
        window.scrollTo(0, document.body.scrollHeight);
        scrollCount++;

        await sleep(DEFAULT_DYNAMIC_LOAD_TIME);

        let newHeight = document.body.scrollHeight;
        if (newHeight == lastHeight) break;
    }
}

function getUrlParams(url) {
    var url = new URL(url);
    var params = new URLSearchParams(url.search);
    return params;
}

function setUrlParams(url, newParams) {
    var url = new URL(url);
    var params = new URLSearchParams(url.search);

    for (let [key, value] of Object.entries(newParams)) {
        params.set(key, value);
    }

    url.search = params.toString();

    return url.toString();
}

function parseSrcSet(srcset){
    srcset = srcset.trim();

    if (srcset.includes(',')){
        var srcMap = {};
        for (let src of srcset.split(',')){
            let [descriptor, url] = Object.entries(parseSrcSet(src))[0];
            srcMap[[descriptor]] = url;
        }
        return srcMap;
    }
    else if (srcset.includes(' ')){
        let [url, descriptor] = srcset.split(' ');
        return {[descriptor]: url};
    }
    else return {url: srcset};
}

function downloadFile(data) {
    const jsonString = JSON.stringify(data, null, 4);

    const blob = new Blob([jsonString], { type: "application/json" });

    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "data.json";

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);
}
