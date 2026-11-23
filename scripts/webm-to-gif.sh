#!/bin/sh
# Converts a Playwright .webm recording into a README-friendly GIF.
#
#   scripts/webm-to-gif.sh <input.webm> <output.gif> [width]
#
# Defaults to 960px wide at 8fps, which keeps a 25s clip around 2-4MB.
# Bayer dithering with rectangle diffing beats sierra2_4a here: the content is
# mostly flat UI, and the smoother dither doubles the file size for no gain.
set -eu

INPUT="${1:?usage: webm-to-gif.sh <input.webm> <output.gif> [width]}"
OUTPUT="${2:?usage: webm-to-gif.sh <input.webm> <output.gif> [width]}"
WIDTH="${3:-960}"

exec ffmpeg -y -hide_banner -loglevel error -i "$INPUT" \
  -vf "fps=8,scale=${WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=110:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  "$OUTPUT"
