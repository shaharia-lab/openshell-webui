#!/usr/bin/env sh
# Generate TypeScript types for the gateway API from ../backend/proto.
# The types describe protojson with proto field names (the HTTP API shape).
set -eu
cd "$(dirname "$0")/.."
out=src/gen
rm -rf "$out" && mkdir -p "$out"
protoc \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out="$out" \
  --ts_proto_opt=onlyTypes=true,useJsonWireFormat=true,snakeToCamel=false,useOptionals=all,forceLong=string,stringEnums=true,enumsAsLiterals=true,unrecognizedEnum=false,outputServices=false,esModuleInterop=true,importSuffix=.ts \
  -I ../backend/proto \
  openshell.proto datamodel.proto sandbox.proto options.proto
