const DEFAULT_MAX_PLACES = Infinity;
const DEFAULT_MAX_REVIEWS = Infinity;

const kwInputElem = document.getElementById("keywordElem");
const maxPlacesElem = document.getElementById("maxPlacesElem");
const maxReviewsElem = document.getElementById("maxReviewsElem");
const saveImagesElem = document.getElementById("saveImagesElem");
const kwInputBtn = document.getElementById("searchBtnElem");
const resetBtn = document.getElementById('resetBtnElem');
const statusElem = document.getElementById("statusElem");

var active = true;

function setStatus(status){
    statusElem.innerHTML = status;
}

function checkStatus(){
    chrome.storage.local.get({'state': null}).then(({state}) => {
        state = JSON.parse(state);

        if (state !== null) {
            let {code, message} = state.status;
    
            active = (code == 'COMPLETE');
            kwInputBtn.disabled = !active;
    
            setStatus(message);
        }
    });
}

function loadUI(){
    chrome.storage.local.get({'state': null}).then(({state}) => {
        state = JSON.parse(
            state,
            function (key, value) {
                return value === "Infinity" ? null : value;
            }
        );

        if (state !== null) {
            let {keyword, maxPlaces, maxReviews, saveImages} = state.inputs;

            kwInputElem.value = keyword ?? '';
            maxPlacesElem.value = maxPlaces ?? '';
            maxReviewsElem.value = maxReviews ?? '';
            saveImagesElem.checked = saveImages;
        }
    });
}

window.onload = function(){
    checkStatus();
    loadUI();

    chrome.storage.onChanged.addListener(function(changes, namespace) {
        checkStatus();
    });
    
    kwInputBtn.addEventListener("click", async (e) => {
        await chrome.storage.local.clear();

        var keyword = kwInputElem.value;
        var maxPlaces = parseInt(maxPlacesElem.value) || DEFAULT_MAX_PLACES;
        var maxReviews = parseInt(maxReviewsElem.value) || DEFAULT_MAX_REVIEWS;
        var saveImages = saveImagesElem.checked;
    
        sendInputs(keyword, maxPlaces, maxReviews, saveImages);
    });

    resetBtn.addEventListener("click", async () => {
        await chrome.storage.local.clear();
        setStatus('reset state');
    })
}



async function sendInputs(keyword, maxPlaces=DEFAULT_MAX_PLACES, maxReviews=DEFAULT_MAX_REVIEWS, saveImages=true){
    // send inputs to content script for it to execute
    // NOTE: actionId must be 1
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

    try{
        let response = await chrome.tabs.sendMessage(
            tab.id, 
            {
                actionId: 1,
                inputs: {
                    keyword: keyword,
                    maxPlaces: maxPlaces === Infinity ? 'Infinity' : maxPlaces,     // Infinity in JS is not serializable in JSON
                    maxReviews: maxReviews === Infinity ? 'Infinity' : maxReviews,  // Infinity in JS is not serializable in JSON
                    saveImages: saveImages
                }
            }
        );
        if (response['type'] == 'ACK'){
            setStatus("searching...");
            kwInputBtn.disabled = true;
        }
        else if (response['type'] == 'error'){
            setStatus(response['message'])
        }
        else setStatus("failed to send keyword");
    }      
    catch(ex){
        console.error(ex);
        setStatus("failed to send keyword. see console.");
    }   
}
