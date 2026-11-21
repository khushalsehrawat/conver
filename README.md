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

Production identity is recorded in `seo-sites.json`; see Canonical URL validation below. The developer credit is not evidence of a project deployment URL.

The footer link uses a normal same-tab hyperlink for the developer credit. Structured data does not guarantee search rich results.

## Development & Maintenance

**Developed & Maintained by
[Khushal Sehrawat](https://github.com/khushalsehrawat)**
— Founder of
[TheBenzzCreations](https://www.thebenzzcreations.com/).

TheBenzzCreations is a digital development studio specializing in website development, custom software, mobile applications, e-commerce solutions and AI-powered business automation.

For development enquiries and collaborations, visit [TheBenzzCreations](https://www.thebenzzcreations.com/).

## Canonical URL validation

Run `python scripts/validate_seo.py` from this repository before publishing. The dependency-free check validates exact page canonicals, Open Graph URLs, website/application JSON-LD URLs, sitemap locations, robots sitemap references and literal framework site metadata against `seo-sites.json`. It checks deployment path prefixes as well as domains, so one GitHub Pages project cannot canonicalize to another.

Only URLs whose live HTML matched the local page on 2026-11-21 are configured. Unverified pages have no canonical or social URL; `python scripts/validate_seo.py --require-verified` also fails for those pending pages. Reverify the configuration if the deployment moves. Dynamic framework expressions still require runtime validation.

TheBenzzCreations attribution, creator organization URLs and existing normal same-tab developer credit links are preserved. These outbound attribution links are separate from site identity.
