#!/bin/bash
if [ -z "$FLEXPATH" ]; then
  export FLEXPATH=/Users/smayhew/flex_sdk_4
fi
./build.sh
cp ../bin/debug/flashls.swc ../../mediaelement/src/flash/flashls.swc 

