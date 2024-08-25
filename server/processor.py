import warnings
warnings.simplefilter(action='ignore', category=FutureWarning)

import os
import json
import uuid
from urllib.parse import urlencode, urlsplit, parse_qs
import requests
import numpy as np
import pandas as pd
import sys
from getopt import getopt
from datetime import datetime

from utils import slugify


class ScraperProcessor:
    __IMAGES_MAX_RES__ = 2400
    __CHUNK_SIZE = 4096

    def __init__(self, inputs, output, output_dir, callback=None) -> None:
        self.inputs = inputs
        self.output = output
        self.output_dir = output_dir
        self.callback = callback

        self.create_folder_structure()
        self.generate_filename()

    def create_folder_structure(self):
        # TODO: add cleansing for keyword
        
        self.base_dir = os.path.join(self.output_dir, self.inputs['keyword'])
        os.makedirs(self.base_dir, exist_ok=True)

        if self.inputs['saveImages']:
            self.image_dir = os.path.join(self.base_dir, 'images')
            os.makedirs(self.image_dir, exist_ok=True)

    def generate_filename(self):
        fname = f'{self.inputs['keyword'].replace(',', ' ')} maxPlaces {self.inputs['maxPlaces']} maxReviews {self.inputs['maxReviews']}'
        fname = slugify(fname)
        fname = f'{fname}-{datetime.now().strftime("%d-%m-%Y-%H-%M-%S")}'

        self.fname = fname

    def __upgrade_image_url(self, url):
        try:
            split = urlsplit(url)
            queryParams = dict(parse_qs(split.query))

            for key, val in queryParams.items():
                queryParams[key] = val[0]
            
            if 'w' in queryParams:
                queryParams['w'] = self.__IMAGES_MAX_RES__
                queryParams['h'] = -1
                return f"{split.scheme}://{split.netloc}{split.path}?{urlencode(queryParams)}"
            else:
                return url
        except:
            return url 

    def tabulate_images(self, df):
        image_dfs = []

        for _, row in df.iterrows():
            image_df = pd.DataFrame(row['images'])
            image_df['review_id'] = row['review_id']

            image_dfs.append(image_df)

        image_df = pd.concat(image_dfs)

        return image_df
    
    def download_image(self, url):
        filename = '-'.join(urlsplit(url).path.strip('/').split('/'))

        r = self.image_session.get(url, stream=True)
        if r.status_code == 200:
            try:
                with open(os.path.join(self.image_dir, filename), 'wb') as f:
                    for chunk in r.iter_content(self.__CHUNK_SIZE):
                        f.write(chunk)
            except Exception as ex:
                print(f"could not write file {filename}")
                print(ex)
                return ''
            else:
                print(f"saved file {filename}")
                return filename
        else:
            print(f"could not get file from CDN")
            return ''
    
    def download_images(self, df):
        cols = df.columns

        if 'url' not in cols:
            df['url'] = np.nan

        # descriptor columns
        wd_columns = [col for col in cols if col.endswith('w')]     # width descriptor columns
        pdd_columns = [col for col in cols if col.endswith('x')]    # pixel density descriptor columns

        # sort columns in term of quality
        wd_columns = sorted(wd_columns, key=lambda d: int(d[:-1]))
        pdd_columns = sorted(pdd_columns, key=lambda d: float(d[:-1]))

        # get highest quality url
        if len(wd_columns) > 0:
            df[wd_columns + ['url']]  = df[wd_columns + ['url']].ffill(axis=1)
        if len(pdd_columns) > 0:
            df.loc[:, pdd_columns + ['url']] = df.loc[:, pdd_columns + ['url']].ffill(axis=1)

        # update url to highest quality
        df['url'] = df['url'].apply(self.__upgrade_image_url)

        self.image_session = requests.Session()

        df.loc[df['url'].notnull(), 'file_name'] = df.loc[df['url'].notnull(), 'url'].apply(self.download_image)

        return df

    def tabulate_output(self):
        review_dfs = []
        image_dfs = []

        for place_item in self.output:
            if len(place_item['reviews']) == 0:
                continue

            review_df = pd.DataFrame(place_item['reviews'])

            review_df['place_name'] = place_item['name']
            review_df['place_location'] = place_item['placeLocation']
            review_df['place_type'] = place_item['placeType']
            
            review_df['lat'] = place_item['placeCoords'].get('lat', np.nan)
            review_df['lng'] = place_item['placeCoords'].get('lng', np.nan)
            review_df[['lat', 'lng']] = review_df[['lat', 'lng']].astype(np.float32)

            review_df['url'] = place_item['url']

            review_df['review_id'] = [uuid.uuid4() for _ in range(review_df.shape[0])]

            image_df = self.tabulate_images(review_df[['review_id', 'images']])

            review_dfs.append(review_df)
            image_dfs.append(image_df)

        review_df = pd.concat(review_dfs) if len(review_dfs) > 0 else None
        image_df = pd.concat(image_dfs) if len(image_dfs) > 0 else None

        return review_df, image_df

    async def async_process(self):
        try:
            await self._async_process()
        except:
            # send back error
            response = {
                'type': 'ERROR',
                'message': 'error in processing. check server console.'
            }
            await self.callback(json.dumps(response))
        else:
            # send back response
            response = {
                'type': 'COMPLETE',
                'message': 'processing complete'
            }
            await self.callback(json.dumps(response))

    async def _async_process(self):
        print("processing data for keyword:", self.inputs['keyword'])

        # dump raw data
        with open(os.path.join(self.base_dir, f'{self.fname}.json'), "w") as of:
            json.dump({"inputs": self.inputs, "output": self.output}, of, indent=4)

        # tabulate data
        review_df, image_df = self.tabulate_output()

        # download images
        if image_df is not None and self.inputs['saveImages']:
            image_df = self.download_images(image_df)

        # save data to excel file
        if review_df is not None or image_df is not None:
            with pd.ExcelWriter(os.path.join(self.base_dir, f'{self.fname}.xlsx')) as writer:    
                if review_df is not None:
                    review_df.to_excel(writer, 'review', index=False)
                if image_df is not None:
                    image_df.to_excel(writer, 'images', index=False)

        print('processed data')

    def process(self):
        print("processing data...")

        # tabulate data
        review_df, image_df = self.tabulate_output()

        # download images
        if self.inputs['saveImages']:
            image_df = self.download_images(image_df)

        # save data to excel file
        with pd.ExcelWriter(os.path.join(self.base_dir, f'{self.fname}.xlsx')) as writer:
            review_df.to_excel(writer, 'review', index=False)
            image_df.to_excel(writer, 'images', index=False)

        print('processed data')


if __name__ == "__main__":
    argv = sys.argv[1:]

    file_path = None
    output_dir = None
  
    try: 
        opts, args = getopt(argv, "i:o:",  ["input-file=", "output-dir="])   
    except: 
        raise RuntimeError("error in parsing command line args") 

    for opt, arg in opts: 
        if opt in ['-i', '--input-file']: 
            file_path = arg
        elif opt in ['-o', '--output-dir']: 
            output_dir = arg

    if file_path is None or not os.path.exists(file_path) or not os.path.isfile(file_path):
        raise RuntimeError("input json file not found")
    if output_dir is None or not os.path.exists(output_dir) or not os.path.isdir(output_dir):
        output_dir = os.path.dirname(file_path)

    message = json.load(open(file_path, mode='r', encoding='utf-8'))
    processor = ScraperProcessor(message['inputs'], message['output'], output_dir)
    processor.process()
