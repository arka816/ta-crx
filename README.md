## Step 1: 
### install tripadvisor-extension.crx on chrome

<b>Keyword</b>: location to search for on tripadvisor <br />
<b>Max Places</b>: maximum number of places to scrape <br />
<b>Max Reviews</b>: maximum number of reviews to scrape
<b>Save Images</b>: whether to save images at back end

 ![demo](demo.png)

## Step 2:
```powershell
cd server
python server.py --port=<port> --output-dir=<output directory>
```

## Step 3:
In case server crashes or service worker fails to communicate with server for a job, content script will initiate download for raw json file. To process this file run:
```powershell
cd server
python processor.py --input-file=<path to raw json> --output-dir=<output directory>
```