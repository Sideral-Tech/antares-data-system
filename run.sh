#!/bin/sh

# Run the application
deno run \
    --unstable \
    --allow-net \
    --allow-read \
    --allow-env \
    main.js
