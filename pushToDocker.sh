#!/bin/bash
npm install

docker build -t jmalab24/vista-monte-mar-be:latest .
docker push jmalab24/vista-monte-mar-be:latest