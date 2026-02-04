#!/bin/sh

# run get.terp.network python script
curl -sL https://get.terp.network/install > i.py && python3 i.py

# after completion, source the profile
source ~/.profile
