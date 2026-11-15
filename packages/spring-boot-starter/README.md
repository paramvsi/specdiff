# specdiff-spring-boot-starter

A Spring Boot starter that serves the Specdiff Viewer, a version-aware API reference and Swagger UI replacement, at `/specdiff`. It renders your app's OpenAPI document with search, code samples and Try it. Point it at an older version as well and it adds change badges and a "What changed" view.

Nothing is uploaded. The Viewer is served from the jar and runs in the reader's browser.

## Install

```xml
<dependency>
  <groupId>io.github.paramvsi</groupId>
  <artifactId>specdiff-spring-boot-starter</artifactId>
  <version>0.1.0-SNAPSHOT</version>
</dependency>
```

The starter does not generate the OpenAPI document. Add [springdoc-openapi](https://springdoc.org), which serves it at `/v3/api-docs`, the starter's default:

```xml
<dependency>
  <groupId>org.springdoc</groupId>
  <artifactId>springdoc-openapi-starter-webmvc-api</artifactId>
  <version>2.10.0</version>
</dependency>
```

Then open http://localhost:8080/specdiff.

Requires Java 21 and a Spring MVC (servlet) app; built against Spring Boot 3.5. The version is not on Maven Central yet. To build it locally:

```sh
pnpm --filter @specdiff/embed build          # the Viewer, bundled into the jar
mvn -f packages/spring-boot-starter/pom.xml install
```

A working app is in [`examples/spring-boot`](../../examples/spring-boot/README.md).

## Properties

| Property | Default | |
|---|---|---|
| `specdiff.enabled` | `true` | Turn the Viewer off without removing the dependency |
| `specdiff.path` | `/specdiff` | Where the Viewer is served |
| `specdiff.spec-url` | `/v3/api-docs` | The OpenAPI document to render |
| `specdiff.compare-with` | none | URL of an older version, for change badges and "What changed" |
| `specdiff.brand-color` | none | Brand colour, as a CSS colour |
| `specdiff.logo-url` | none | Logo URL shown in the Viewer header |
| `specdiff.title` | `API reference` | Title in the browser tab |

```yaml
specdiff:
  path: /docs
  compare-with: /openapi/1.5.0.yaml
  brand-color: "#1f55c4"
```

## What it serves

Under `specdiff.path`: `index.html`, `boot.js`, `config.json` (built from the properties above) and `assets/` (the Viewer bundle, cached for a year). `/specdiff` redirects to `/specdiff/`. The page has no inline script, so a strict Content Security Policy works.

## Licence

MIT
