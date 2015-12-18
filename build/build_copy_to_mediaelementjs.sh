#!/bin/bash
if [ -z "$FLEXPATH" ]; then
  export FLEXPATH=~/flex_sdk_4
fi
./build.sh
cp ../bin/debug/flashlsOSMF.swc ../../mediaelement/src/flash/

