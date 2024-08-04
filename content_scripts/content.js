/*
 * structure of job state variable:
 *  actionId: Integer representing the action sequence to be run
 *  inputs:   Object representing inputs required for initial run
 *  state:    Object representing current scraper state
 *  status:   String 'UNINITIATED'/'RUNNING'/'COMPLETE'/'DOWNLOADING'
 *  output:   Object cumulative output of all actions under this job
*/

class ReviewParser{
    constructor(state){
        this.state = state;
        this.actionId = state.actionId;

        this.keyword = state.inputs.keyword;
        this.maxPlaces = state.inputs.maxPlaces;
        this.maxReviews = state.inputs.maxReviews;
        this.saveImages = state.inputs.saveImages;

        this.output = state.output;

        this.placesCount = state.state.placesCount ?? 0;
        this.placeUrls = state.state.placeUrls ?? [];

        this.currentPlace = state.state.currentPlace ?? null;
        this.currentReviews = state.state.currentReviews ?? [];
        this.currentReviewsCount = state.state.currentReviewsCount ?? 0;

        this.start = this.start.bind(this);
        this.getElementByXpath = this.getElementByXpath.bind(this);
        this.saveState = this.saveState.bind(this);
        this.clearState = this.clearState.bind(this);
        this.updateNextAction = this.updateNextAction.bind(this);
        this.updatePlaces = this.updatePlaces.bind(this);
        this.updateStatus = this.updateStatus.bind(this);
        this.notifyError = this.notifyError.bind(this);
        this.search = this.search.bind(this);
        this.setMaxPlacesCount = this.setMaxPlacesCount.bind(this);
        this.expandReviewsContainer = this.expandReviewsContainer.bind(this);
        this.switchTabs = this.switchTabs.bind(this);
        this.scrapePlaces = this.scrapePlaces.bind(this);
        this.placesFinished = this.placesFinished.bind(this);
        this.scrapeReviews = this.scrapeReviews.bind(this);
        this.switchPlace = this.switchPlace.bind(this);
        this.updateOutput = this.updateOutput.bind(this);
        this.scrapeReviewsWrap = this.scrapeReviewsWrap.bind(this);
        this.swipeReview = this.swipeReview.bind(this);
        this.swipeHotelReview = this.swipeHotelReview.bind(this);
        this.swipeRestaurantReview = this.swipeRestaurantReview.bind(this);
        this.sendToServer = this.sendToServer.bind(this);

        this.start();
    }

    getElementByXpath(path) {
        return document.evaluate(
            path, 
            document, 
            null, 
            XPathResult.FIRST_ORDERED_NODE_TYPE, 
            null
        ).singleNodeValue;
    }

    getElementsByXpath(path) {
        return document.evaluate(
            path, 
            document, 
            null, 
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, 
            null
        );
    }

    saveState(){
        // utility to save scraper state
        return chrome.storage.local.set({state: JSON.stringify(this.state)});
    }

    clearState(){
        return chrome.storage.local.clear();
    }

    updateNextAction(){
        this.actionId ++;
        this.state = {...this.state, actionId: this.actionId};
        return this.saveState();
    }

    updatePlaces(){
        this.state = {
            ...this.state, 
            state: {
                ...this.state.state, 
                placesCount: this.placesCount,
                placeUrls: this.placeUrls
            }
        }
        return this.saveState();
    }

    updateStatus(status){
        this.state = {...this.state, status: status};
        return this.saveState();
    }

    search(){
        // update state
        this.updateStatus({
            code: 'RUNNING',
            message: 'searching...'
        })
        .then(() => {
            return this.updateNextAction();
        })
        .then(() => {
            // RELOAD event: redirect to search page
            window.location = `https://www.tripadvisor.in/Search?q=${this.keyword}`;
        })
    }

    tabContainerExists(){
        // utility to search for tab container
        return exists('header.xySeT > div.YvlOj > div.eGVWv') || exists('div.giPtt');
    }

    placesContainerExists(){
        // utility to search for places container
        return exists('div.SVuzf > div > div.kgrOn > a');
    }

    placeCountContainerExists(){
        // utility to search for place count container
        return exists('div.uYzlj > div.biGQs > div.Ci')
    }

    reviewsContainerExists(){
        // utility to search for reviews container
        return exists('div#tab-data-qa-reviews-0 > div.eSDnY > div.LbPSX > div > div[data-automation="tab"]');
    }

    hotelReviewsContainerExists(){
        // utility to search for reviews container for hotel pages
        return exists('div[data-test-target="reviews-tab"] > div.ruCQl > div.uqMDf > div.azLzJ');
    }

    restaurantReviewsContainerExists(){
        // utility to search for reviews container for restaurant pages
        return exists('section#REVIEWS > div.iTazX > div.zyBif > div > div > div.JmLZe > div > div');
    }

    showMoreBtnExists(){
        return exists('div.SVuzf button.rmyCe');
    }

    async setMaxPlacesCount(){
        // util to get count of places returned by search
        // set maxPlaces to minimum of user set and available
        try{
            if (await wait(this.placeCountContainerExists, 500, 10*1000)){
                var placeResultsCountText = document.querySelector('div.uYzlj > div.biGQs > div.Ci').innerText;
                var placeResultsCount = parseInt(placeResultsCountText.split(' ').at(-1));
            }
        }
        catch(e){
            console.log(e);
            return;
        }
        finally{
            this.maxPlaces = Math.min(placeResultsCount, this.maxPlaces);
        }
    }

    async expandReviewsContainer(){
        // show more button
        if (await wait(this.showMoreBtnExists, 500, 10 * 1000)) {
            var showMoreBtn = document.querySelector('div.SVuzf button.rmyCe');
            showMoreBtn.click();
        }
        else {
            this.notifyError('"show more" button not found');
        }
    }

    notifyError(errMsg){
        // utility function to notify error
        // current implementation using alerts
        // TODO: more sophisticated
        this.clearState().then(
            () => {
                alert(errMsg);
                window.location = ALLOWED_HOMEPAGE_LOCATIONS[0];
            }
        );
    }

    async switchTabs(){
        // switch to the 'things to do' tab
        if (! await wait(this.tabContainerExists, 500, 10*1000)) {
            // send error
            this.notifyError('"all results" tab not found');
        }

        var tabContainer = document.querySelector('header.xySeT > div.YvlOj > div.eGVWv');
        var tabMode = 1;

        if (tabContainer === null) {
            // wider page i.e. different xpath needed
            tabContainer = document.querySelector('div.giPtt');
            tabMode = 2;
        }

        console.log("tab mode", tabMode);

        if(tabContainer !== null){
            // switch to tab
            if (tabMode == 1){
                let tabs = document.querySelectorAll('header.xySeT > div.YvlOj > div.eGVWv > button');
                for (let tab of tabs) {
                    console.log(tab.innerText.toLowerCase());
                    if (tab.innerText.toLowerCase() == 'all results') {
                        tab.click();
                        break;
                    }
                }
            }
            else if (tabMode == 2){
                let tabs = document.querySelectorAll('div.giPtt > div.Ph > a > div');
                for (let tab of tabs) {
                    if (tab.innerText.toLowerCase() == 'all results') {
                        tab.click();
                        break;
                    }
                }
            }

            // expand by clicking on show more button
            await this.expandReviewsContainer();

            // update places count
            await this.setMaxPlacesCount();

            // update state
            await this.updateNextAction();

            // scrape places
            await this.scrapePlaces();
        }
        else{
            // send error message
            this.notifyError('"all results" tab not found');
        }
    }

    async placesFinished(){
        // handler for when places scraping completes
        // updates review based state like currentPlace and 
        // redirects to first place url to start review scraper

        await this.updateStatus({
            code: 'RUNNING',
            message: 'scraped places'
        });
        await this.updateNextAction();

        this.state = {
            ...this.state, 
            state: {
                ...this.state.state, 
                currentPlace: 0
            }
        }
        await this.saveState();

        window.location = this.placeUrls[0].url;
    }

    async updateOutput(){
        // update output array with review outputs from current place
        let placeObj = {
            name: this.placeUrls[this.currentPlace].placeName,
            url: this.placeUrls[this.currentPlace].url,
            placeType: this.placeUrls[this.currentPlace].placeType,
            reviews: this.currentReviews
        }

        this.output.push(placeObj);

        this.state = {...this.state, output: this.output};

        return this.saveState();
    }

    async switchPlace(){
        // handler to switch to next place when
        // all reviews from current place have been scraped

        this.currentPlace ++;
        this.currentReviews = [];
        this.currentReviewsCount = 0;

        this.state = {
            ...this.state,
            state: {
                ...this.state.state,
                currentPlace: this.currentPlace,
                currentReviews: this.currentReviews,
                currentReviewsCount: this.currentReviewsCount
            }
        }
        
        await this.saveState();

        if (this.currentPlace >= this.placeUrls.length) {
            // all reviews scraped
            await this.updateStatus({
                code: 'RUNNING',
                message: 'finished scraping reviews'
            })

            await this.updateNextAction();

            window.location = this.state.host;
        }
        else{
            window.location = this.placeUrls[this.currentPlace].url;
        }
    }

    async swipeReview(){
        // handler to swipe to next review page
        var nextReviewBtn = document.querySelector(
            `div#tab-data-qa-reviews-0 > div.eSDnY > div.LbPSX > div > div[data-automation="tab"]:last-child > 
            div:nth-child(2) > div > div.OvVFl.j > div.xkSty > div.UCacc > a`
        )

        if (nextReviewBtn !== null){
            nextReviewBtn.click();
        }
        else {
            console.log('no more review pages');
            console.log(this.currentReviews);

            await this.updateOutput();
            this.switchPlace();
        }
    }

    async swipeHotelReview(){
        // handler to swipe to next hotel review page
        var nextReviewBtn = document.querySelector(
            `div[data-test-target="reviews-tab"] > div.ruCQl.z > div.uqMDf.z.BGJxv.xOykd.jFVeD.yikFK > 
            div > div.uYzlj.c > div.lATJZ > div.OvVFl.j > div.xkSty > div.UCacc > a`
        )

        if (nextReviewBtn !== null) {
            nextReviewBtn.click();
        }
        else {
            console.log('no more review pages');
            console.log(this.currentReviews);

            await this.updateOutput();
            this.switchPlace();
        }
    }

    async swipeRestaurantReview(){
        // handler to swipe to next hotel review page
        var nextReviewBtn = document.querySelector(
            `section#REVIEWS > div.iTazX > div.zyBif > div > div > div.uYzlj > 
            div.lATJZ > div.OvVFl.j > div.xkSty > div.UCacc > a`
        )

        if (nextReviewBtn !== null) {
            nextReviewBtn.click();
        }
        else {
            console.log('no more review pages');
            console.log(this.currentReviews);

            await this.updateOutput();
            this.switchPlace();
        }
    }

    async scrapePlaces(){
        // edge case: places count already exceeded max places input
        if (this.placesCount >= this.maxPlaces) {
            await this.placesFinished();
        }

        // scrape urls from places to go / things to do items in current page
        if (! await wait(this.placesContainerExists, 500, 10*1000)){
            if (this.placesCount == 0){
                // send error
                this.notifyError("container for places not found");
            }
            else {
                // Case 1: actual error happened but some results have been collected
                // Case 2: in case max places was not updated, no more results exist
                await this.placesFinished();
            }
        }
        else {
            await this.updateStatus({
                code: 'RUNNING',
                message: 'scraping places...'
            })
        }

        await scrollToBottom();

        var placeItems = this.getElementsByXpath("//div[contains(@class, 'SVuzf')]/div/div[contains(@class, 'kgrOn')]/a[1]");
        var finished = false;

        for (let i=0; i < placeItems.snapshotLength; i++) {
            let placeItem = placeItems.snapshotItem(i);

            // get url
            let url = placeItem.href ?? placeItem.getAttribute('href');

            // get place type
            let placeTypeContainer = placeItem.querySelector("div > div.yJIls.z.y > header > div > div > div > div.ngpKT > span.biGQs");
            let placeType = null;
            if (placeTypeContainer !== null){
                placeType = placeTypeContainer.innerText.toLowerCase();
            }

            // get place name
            let placeNameContainer = placeItem.querySelector("div > div.yJIls.z.y > header > div > div > div.biGQs._P.fiohW.ngXxk > a");
            let placeName = placeNameContainer.innerText.toLowerCase();

            if (url !== undefined && url !== null){
                if (SUPPORTED_SCRAPERS.includes(placeType)){
                    this.placeUrls.push({
                        url: url,
                        placeType: placeType,
                        placeName: placeName
                    });
                    this.placesCount++;
                }
            }

            if (this.placesCount >= this.maxPlaces) {
                finished = true;
                break;
            }
        }

        console.log(this.placeUrls);

        await this.updatePlaces();

        if (finished) {
            await this.placesFinished();
        }
        else {
            // redirect to next places page
            var currParams = getUrlParams(window.location.href);
            var offset = parseInt(currParams.get('offset')) ?? 0;

            var newParams = {offset: offset + PLACES_PER_PAGE};
            var url = setUrlParams(window.location.href, newParams);

            window.location = url;
        }
    }

    async scrapeReviewsWrap(){
        // wrapper function that calls one of the scrapers depending on placetype
        var placeType = this.placeUrls[this.currentPlace].placeType;

        if(!SUPPORTED_SCRAPERS.includes(placeType)){
            alert(`scraping for ${placeType} is not supported yet`)
            await this.switchPlace();
        }
        else {
            if(placeType == 'things to do') await this.scrapeReviews();
            else if(placeType == 'hotel') await this.scrapeHotelReviews();
            else if(placeType == 'restaurant') await this.scrapeRestaurantReviews();
        }
    }

    async scrapeReviews(){
        // edge case: places count already exceeded max places input
        if (this.currentReviewsCount >= this.maxReviews) {
            await this.updateOutput();
            this.switchPlace();
        }

        await scrollToBottom();

        // scrape urls from places to go / things to do items in current page
        if (! await wait(this.reviewsContainerExists, 500, 10*1000)){
            // log error
            // this.notifyError("container for reviews not found")
            console.log("container for reviews not found");

            // push whatever reviews collected so far, if any
            if (this.currentReviewsCount > 0) {
                await this.updateOutput();
            }

            // switch to next place
            await this.switchPlace();
        }
        else {
            await this.updateStatus({
                code: 'RUNNING',
                message: 'scraping reviews...'
            })
        }

        var reviewItems = document.querySelectorAll('div#tab-data-qa-reviews-0 > div.eSDnY > div.LbPSX > div > div[data-automation="tab"]');
        var finished = false;

        for (let reviewItem of reviewItems) {
            // check if if this is the last item in the review container
            if (reviewItem.querySelector('div.uYzlj') !== null) break;

            // reviewer username
            try{
                var username = reviewItem.querySelector('div > div > div.mwPje.f.M.k > div.XExLl.f.u.o > div.zpDvc.Zb > span > a').innerText;
            }
            catch(e){
                var username = '';
            }
            
            // rating text
            try{
                var ratingText = reviewItem.querySelector('svg.UctUV title').textContent;
            }
            catch(e){
                var rating = null;
            }
            finally{
                if (ratingText !== undefined){
                    var rating = parseFloat(ratingText.split(' ')[0]);
                }
                else{
                    rating = null;
                }
            }

            // review title
            try{
                var reviewTitle = reviewItem.querySelector('div.biGQs > a > span.yCeTE').innerText;
            }
            catch(e){
                var reviewTitle = '';
            }

            // visit date and if possible trip type
            try{
                var reviewDateText = reviewItem.querySelector('div.RpeCd').innerText;
            }
            catch(e){
                var reviewDate = '';
                var reviewTripType = '';
            }
            finally{
                if (reviewDateText !== undefined) {
                    if (reviewDateText.includes('•')) {
                        var [reviewDate, reviewTripType] = reviewDateText.split('•');
                        reviewDate = reviewDate.trim();
                        reviewTripType = reviewTripType.trim();
                    }
                    else {
                        var reviewDate = reviewDateText.trim();
                        var reviewTripType = '';
                    }
                }
                else {
                    var reviewDate = '';
                    var reviewTripType = '';
                }
            }

            // review text
            var readMoreBtn = reviewItem.querySelector('div.FKffI > div.lszDU button span');

            // expand full review text
            if (readMoreBtn !== null && readMoreBtn.innerText.trim().toLowerCase() == 'read more') {
                readMoreBtn.click();
            }

            try{
                var reviewText = reviewItem.querySelector('div.FKffI > div.fIrGe > div.biGQs > span.JguWG > span.yCeTE').innerText;
            }
            catch(e){
                var reviewText = '';
            }
            
            // get image links
            var imageContainer = reviewItem.querySelector('div.LblVz');
            var imageSources = [];

            if (imageContainer != null) {
                let images = imageContainer.querySelectorAll('div > button > span > picture > img');

                for (let image of images) {
                    let imgSrcSet = image.getAttribute('srcset');
                    imageSources.push(parseSrcSet(imgSrcSet));
                }
            }

            // get review write date
            try{
                var reviewWrittenText = reviewItem.querySelector('div.TreSq > div:nth-child(1)').innerText.toLowerCase();
            }
            catch(e){
                var reviewWrittenDate = '';
            }
            finally{
                if (reviewWrittenText !== undefined){
                    var reviewWrittenDate = reviewWrittenText.replace('written', '').trim();
                }
                else {
                    var reviewWrittenDate = '';
                }
            }

            let review = {
                username: username,
                rating: rating,
                title: reviewTitle,
                travelDate: reviewDate,
                tripType: reviewTripType,
                text: reviewText,
                images: imageSources,
                reviewDate: reviewWrittenDate
            }

            this.currentReviews.push(review);
            this.currentReviewsCount ++;

            if (this.currentReviewsCount >= this.maxReviews) {
                finished = true;
                break;
            }
        }

        if (finished) {
            console.log(this.currentReviews);
            await this.updateOutput();
            this.switchPlace();
        }
        else {
            // switch to next review page
            // or if no more reviews switch to next place
            await this.swipeReview();

            // call this function recursively
            await this.scrapeReviews();
        }
    }

    async scrapeHotelReviews(){
        // edge case: places count already exceeded max places input
        if (this.currentReviewsCount >= this.maxReviews) {
            await this.updateOutput();
            this.switchPlace();
        }

        await scrollToBottom();

        // scrape urls from places to go / things to do items in current page
        if (! await wait(this.hotelReviewsContainerExists, 500, 10*1000)){
            // log error
            // this.notifyError("container for reviews not found")
            console.log("container for reviews not found");

            // push whatever reviews collected so far, if any
            if (this.currentReviewsCount > 0) {
                await this.updateOutput();
            }

            // switch to next place
            await this.switchPlace();
        }
        else {
            await this.updateStatus({
                code: 'RUNNING',
                message: 'scraping reviews...'
            })
        }

        var reviewItems = document.querySelectorAll('div[data-test-target="reviews-tab"] > div.ruCQl > div.uqMDf > div.azLzJ');
        var finished = false;

        for (let reviewItem of reviewItems) {
            // reviewer username
            try{
                var username = reviewItem.querySelector('div.MD > div > div.w.o > div > div > span > a.blnum.BDpWK').innerText;
            }
            catch(e){
                var username = '';
            }
            
            // rating text
            try{
                var ratingText = reviewItem.querySelector('div.kmMXA._T.Gi > div.WcRsW.f.O > div > svg title').textContent;
            }
            catch(e){
                var rating = null;
            }
            finally{
                if (ratingText !== undefined){
                    var rating = parseFloat(ratingText.split(' ')[0]);
                }
                else{
                    rating = null;
                }
            }

            // review title
            try{
                var reviewTitle = reviewItem.querySelector('div.kmMXA._T.Gi > div.joSMp.MI._S.b.S6.H5.Cj._a > a > span > span').innerText;
            }
            catch(e){
                var reviewTitle = '';
            }

            // date of stay
            try{
                var reviewDateContainer = reviewItem.querySelector('div.kmMXA._T.Gi > div.yJgrn > div.PDZqu > span.iSNGb._R.Me.S4.H3.Cj');
            }
            catch(e){
                var reviewDate = '';
            }
            finally{
                if (reviewDateContainer !== null && reviewDateContainer.childNodes.length >= 2){
                    var reviewDate = reviewDateContainer.childNodes[1].nodeValue.trim().toLowerCase();
                }
                else {
                    var reviewDate = '';
                }
            }

            // review text
            var readMoreBtn = reviewItem.querySelector('div.kmMXA._T.Gi > div.yJgrn > div._T.FKffI.bmUTE > div.lszDU > div > span.bcpeg._S.Ci');

            // expand full review text
            if (readMoreBtn !== null && readMoreBtn.innerText.trim().toLowerCase() == 'read more') {
                readMoreBtn.click();
            }

            try{
                var reviewText = reviewItem.querySelector('div.kmMXA._T.Gi > div.yJgrn > div._T.FKffI > div.fIrGe._T > span > span').innerText;
            }
            catch(e){
                var reviewText = '';
            }
            
            // get image links
            var imageContainer = reviewItem.querySelector('div.f.z.QBsxC');
            var imageSources = [];

            if (imageContainer != null) {
                let images = imageContainer.querySelectorAll('div > picture > img');

                for (let image of images) {
                    let imgSrcSet = image.getAttribute('src');
                    imageSources.push(parseSrcSet(imgSrcSet));
                }
            }

            // get review write date
            try{
                var reviewWrittenContainer = reviewItem.querySelector('div.MD > div > div.w.o > div > div > span');
            }
            catch(e){
                var reviewWrittenDate = '';
            }
            finally{
                if (reviewWrittenContainer !== null && reviewWrittenContainer.childNodes.length >= 2){
                    var reviewWrittenDate = reviewWrittenContainer.childNodes[1].nodeValue.toLowerCase().replace('wrote a review', '').trim();
                }
                else {
                    var reviewWrittenDate = '';
                }
            }

            let review = {
                username: username,
                rating: rating,
                title: reviewTitle,
                travelDate: reviewDate,
                text: reviewText,
                images: imageSources,
                reviewDate: reviewWrittenDate
            }

            this.currentReviews.push(review);
            this.currentReviewsCount ++;

            if (this.currentReviewsCount >= this.maxReviews) {
                finished = true;
                break;
            }
        }

        if (finished) {
            console.log(this.currentReviews);

            await this.updateOutput();
            this.switchPlace();
        }
        else {
            // switch to next review page
            // or if no more reviews switch to next place
            await this.swipeHotelReview();

            // call this function recursively
            await this.scrapeHotelReviews();
        }
    }

    async scrapeRestaurantReviews(){
        // edge case: places count already exceeded max places input
        if (this.currentReviewsCount >= this.maxReviews) {
            await this.updateOutput();
            this.switchPlace();
        }

        await scrollToBottom();

        // scrape urls from places to go / things to do items in current page
        if (! await wait(this.restaurantReviewsContainerExists, 500, 10*1000)){
            // log error
            // this.notifyError("container for reviews not found")
            console.log("container for reviews not found");

            // push whatever reviews collected so far, if any
            if (this.currentReviewsCount > 0) {
                await this.updateOutput();
            }

            // switch to next place
            await this.switchPlace();
        }
        else {
            await this.updateStatus({
                code: 'RUNNING',
                message: 'scraping reviews...'
            })
        }

        var reviewItems = document.querySelectorAll('section#REVIEWS > div.iTazX > div.zyBif > div > div > div.JmLZe > div > div');
        var finished = false;

        for (let reviewItem of reviewItems) {
            // reviewer username
            try{
                var username = reviewItem.querySelector('div > div.jOdBK.k > div.XExLl.f.u.o > div.zpDvc.Zb > span > a').innerText;
            }
            catch(e){
                var username = '';
            }
            
            // rating text
            try{
                var ratingText = reviewItem.querySelector('div > div.kKMmV.J.k > svg > title').textContent;
            }
            catch(e){
                var rating = null;
            }
            finally{
                if (ratingText !== undefined){
                    var rating = parseFloat(ratingText.split(' ')[0]);
                }
                else{
                    rating = null;
                }
            }

            // review title
            try{
                var reviewTitle = reviewItem.querySelector('div > div[data-test-target="review-title"] > span > div > a').innerText;
            }
            catch(e){
                var reviewTitle = '';
            }

            // review date and if possible trip type
            try{
                var reviewDateText = reviewItem.querySelector('div > div.Szuxy').innerText;
            }
            catch(e){
                var reviewDate = '';
                var reviewTripType = '';
            }
            finally{
                if (reviewDateText !== undefined) {
                    if (reviewDateText.includes('•')) {
                        var [reviewDate, reviewTripType] = reviewDateText.split('•');
                        reviewDate = reviewDate.trim();
                        reviewTripType = reviewTripType.trim();
                    }
                    else {
                        var reviewDate = reviewDateText.trim();
                        var reviewTripType = '';
                    }
                }
                else {
                    var reviewDate = '';
                    var reviewTripType = '';
                }
            }

            // review text
            var readMoreBtn = reviewItem.querySelector('div > div[data-test-target="review-body"] > span > div > div.lszDU > button > span');

            // expand full review text
            if (readMoreBtn !== null && readMoreBtn.innerText.trim().toLowerCase() == 'read more') {
                readMoreBtn.click();
            }

            try{
                var reviewText = reviewItem.querySelector('div > div[data-test-target="review-body"] > span > div > div.fIrGe._T.bgMZj > div > span').innerText;
            }
            catch(e){
                var reviewText = '';
            }
            
            // get image links
            var imageContainer = reviewItem.querySelector('div > div.XzlVY');
            var imageSources = [];

            if (imageContainer != null) {
                let images = imageContainer.querySelectorAll('button > picture > img');

                for (let image of images) {
                    let imgSrcSet = image.getAttribute('srcset') ?? image.getAttribute('src');
                    imageSources.push(parseSrcSet(imgSrcSet));
                }
            }

            // get review write date
            try{
                var reviewWrittenText = reviewItem.querySelector('div > div.ncVYc > div.biGQs._P.pZUbB.ncFvv.osNWb').innerText.toLowerCase();
            }
            catch(e){
                var reviewWrittenDate = '';
            }
            finally{
                if (reviewWrittenText !== undefined){
                    var reviewWrittenDate = reviewWrittenText.replace('written', '').trim();
                }
                else {
                    var reviewWrittenDate = '';
                }
            }

            let review = {
                username: username,
                rating: rating,
                title: reviewTitle,
                travelDate: reviewDate,
                tripType: reviewTripType,
                text: reviewText,
                images: imageSources,
                reviewDate: reviewWrittenDate
            }

            this.currentReviews.push(review);
            this.currentReviewsCount ++;

            if (this.currentReviewsCount >= this.maxReviews) {
                finished = true;
                break;
            }
        }

        if (finished) {
            console.log(this.currentReviews);

            await this.updateOutput();
            this.switchPlace();
        }
        else {
            // switch to next review page
            // or if no more reviews switch to next place
            await this.swipeRestaurantReview();

            // call this function recursively
            await this.scrapeRestaurantReviews();
        }
    }

    async sendToServer(){
        await this.updateStatus({
            code: 'DOWNLOADING',
            message: 'sending data to server...'
        })

        chrome.runtime.sendMessage(
            {
                action: "download", 
                inputs: this.state.inputs, 
                output: this.state.output
            }, 
            (response) => {
                if (chrome.runtime.lastError) {
                    console.log(chrome.runtime.lastError);
                    downloadFile(this.state.output);
                }
                else {
                    if (response.type == 'ACK'){
                        var status = {
                            code: 'PROCESSING',
                            message: response.message
                        };
                    }
                    else if (response.type == 'ERROR'){
                        // falling back to raw data download
                        var status = {
                            code: 'COMPLETE',
                            message: 'downloaded raw json'
                        };
                        downloadFile(this.state.output);
                    }
                }

                this.updateStatus(status);
            }
        );
    }

    async start(){
        // verify if process is running
        if (this.state.status.code == 'PROCESSING' || this.state.status.code == 'DOWNLOADING' || this.state.status.code == 'COMPLETE'){
            console.log('no foreground process to run');
            return;
        }

        // verify if url is correct for current action id
        const verifier = STATE_PATHNAME_VERIFIER_MAP[this.actionId] ?? function(){return true}
        if (! verifier()){
            // send error
            this.notifyError("url does not match scraper's current action")
        }

        switch(this.actionId){
            case 1:
                // input keyword and submit form
                this.search();
                break;
            case 2:
                // switch tabs
                await this.switchTabs();
                break;
            case 3:
                // start scraping
                await this.scrapePlaces();
                break;
            case 4:
                await this.scrapeReviewsWrap();
                break;
            case 5:
                await this.sendToServer();
                break;
        }
    }
}

var parser;

window.beforeunload = function(e){
    var confirmationMessage = 'Scraping is going on. Leaving page might disrupt scraper performance.';

    (e || window.event).returnValue = confirmationMessage;  //Gecko + IE
    return confirmationMessage;                             //Gecko + Webkit, Safari, Chrome etc.
}

window.onload = function(){
    console.log("loaded content script");

    chrome.runtime.onMessage.addListener(
        function(msg, sender, sendResponse) {
            if (!ALLOWED_HOMEPAGE_LOCATIONS.includes(window.location.href)){
                // not in homepage
                window.location = ALLOWED_HOMEPAGE_LOCATIONS[0];
            }

            console.log(msg);
            if (msg.actionId === null) return;
            else if (msg.actionId == 1){
                // initial action => requires inputs
                if ('keyword' in msg.inputs && 'maxPlaces' in msg.inputs &&
                    'maxReviews' in msg.inputs && 'saveImages' in msg.inputs){
                    // init state variable
                    var state = {
                        actionId: msg.actionId,
                        inputs: msg.inputs,
                        state: {},
                        status: {
                            code: 'UNINITIATED',
                            message: 'starting scraper...'
                        },
                        host: window.location.href,
                        output: []
                    }
                    sendResponse({type: 'ACK'});
                    chrome.storage.local.set({state: JSON.stringify(state)}).then(() => {
                        parser = new ReviewParser(state);
                    })
                }
                else{
                    // not all inputs found
                    sendResponse({type: 'error', message: 'one or more inputs missing for action id 1'});
                }
            }
            return true;
        }
    );

    // get state from chrome.storage API
    chrome.storage.local.get({'state': null}).then((result) => {
        if (result.state === null) return;

        var state = JSON.parse(result.state);

        console.log(state);
        parser = new ReviewParser(state);
    });
}
