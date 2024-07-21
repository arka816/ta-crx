#!/usr/bin/env python3

import asyncio
from websockets import ConnectionClosedOK
from websockets.server import serve
import json
import sys
from getopt import getopt
from processor import ScraperProcessor

# default
port = 4567
output_dir = r'C:\Users\arka\Downloads'

argv = sys.argv[1:] 
  
try: 
    opts, args = getopt(argv, "o:p:",  ["output-dir=", "port="])   
except: 
    print("error in parsing command line args. falling back to default values.") 

for opt, arg in opts: 
    if opt in ['-o', '--output-dir']: 
        output_dir = arg 
    elif opt in ['-p', '--port']: 
        port = arg 


async def handler(socket):
    while True:
        try:
            message = await socket.recv()
        except ConnectionClosedOK:
            continue

        # process message
        message = json.loads(message)

        if message['type'] == 'INIT':
            # spawn a pid to process scraper data
            processor = ScraperProcessor(message['inputs'], message['output'], output_dir, socket.send)

            # acknowledge reception of data
            response = {
                'type': 'ACK',
                'message': 'job queued at server-side. processing...'
            }
            await socket.send(json.dumps(response))

            await processor.process()
        elif message['type'] == 'ECHO':
            await socket.send(json.dumps(message))
        

async def main():
    async with serve(handler, "localhost", port):
        await asyncio.Future()

if __name__ == '__main__':
    asyncio.run(main())

    # test
    # inputs = {
    #     'keyword': 'darjeeling',
    #     'saveImages': True
    # }
    # output = json.load(open('data.json'))

    # processor = ScraperProcessor(inputs, output, output_dir, print)
    # processor.process()
