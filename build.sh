
#!/usr/bin/env bash


SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
TMP_DIR=${SCRIPT_DIR}/.tmp
BUILD_DIR=${TMP_DIR}/build
DIST_DIR=${SCRIPT_DIR}/dist
DIST_FILE="${DIST_DIR}/layer.zip"

mkdir -p $TMP_DIR


ARCHIVE_PATH="${TMP_DIR}/ffmpeg-release-amd64-static.tar.xz"
EXTRACTED_DIR="${TMP_DIR}/ffmpeg-*-static"


[ -e $ARCHIVE_PATH ] || \
    curl "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz" \
    -s \
    -o "${ARCHIVE_PATH}" 
    
tar -x -f "${ARCHIVE_PATH}" -C "$TMP_DIR"

rm -rf $BUILD_DIR || true
rm -rf $DIST_DIR  || true

mkdir -p $BUILD_DIR
mkdir -p $DIST_DIR

pushd $EXTRACTED_DIR
cp ffmpeg "$BUILD_DIR"
popd

tsc --declaration --sourceMap --outDir "$BUILD_DIR" "${SCRIPT_DIR}/code"/*


pushd $BUILD_DIR

zip -qq -r -m "${DIST_FILE}" *

popd

