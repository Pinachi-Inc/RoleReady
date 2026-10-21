# CV style samples and picker thumbnails

`sample-cv.json` and `sample-letter.txt` are a synthetic person (not real) used to show each style.

Render every style to PDF:

    node scripts/cv-styles/render.mjs /tmp/cv-style-samples

Regenerate the picker thumbnails in `public/cv-styles/` after changing a style
(needs poppler's `pdftoppm` and ImageMagick):

    for st in classic modern executive; do
      pdftoppm -r 90 -png -f 1 -l 1 -singlefile /tmp/cv-style-samples/$st-cv.pdf /tmp/thumb-$st
      convert /tmp/thumb-$st.png -resize 360x -strip -quality 82 public/cv-styles/$st.webp
    done
