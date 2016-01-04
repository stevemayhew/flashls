#!/bin/bash
if [ -z "$FLEXPATH" ]; then
  export FLEXPATH=~/flex_sdk_4
fi
./build.sh
cp -v ../bin/debug/flashlsOSMF.swc ../../mediaelement/src/flash/

