# LuxConvert

Local file conversion tools built with plain HTML, CSS and JavaScript:

- `index.html`: converter directory.
- `heicc.html`: HEIC/HEIF and image conversion to JPG/JPEG, with folder input and ZIP export.
- `mov.html`: MOV conversion to MP4 and/or a JPG preview of the first frame using ffmpeg.wasm.

Conversion runs in the browser. External fonts, styles and libraries are loaded from CDNs and require an internet connection.

## Local preview

Serve this directory with a static web server, for example `python -m http.server 8000`, then open `http://localhost:8000`.

No package installation, build command or lint suite is configured. MOV conversion depends on the existing ffmpeg.wasm setup and browser support.

## SEO metadata

All three HTML pages preserve their original titles and descriptions and include developer author/creator metadata, Open Graph metadata and Twitter card metadata. The homepage includes one WebSite JSON-LD block identifying TheBenzzCreations as the creator, and one visible developer link in the existing footer.

The official public URL has not been supplied. Canonical links, `og:url` and the WebSite `url` are omitted until LuxConvert's public URL is verified. Do not use the developer website as LuxConvert's canonical URL. No social preview image is configured because no suitable image asset is present.

The footer link uses a normal same-tab hyperlink for the developer credit. Structured data does not guarantee search rich results.

## Development & Maintenance

**Developed & Maintained by
[Khushal Sehrawat](https://github.com/khushalsehrawat)**
— Founder of
[TheBenzzCreations](https://www.thebenzzcreations.com/).

TheBenzzCreations is a digital development studio specializing in website development, custom software, mobile applications, e-commerce solutions and AI-powered business automation.

For development enquiries and collaborations, visit [TheBenzzCreations](https://www.thebenzzcreations.com/).
