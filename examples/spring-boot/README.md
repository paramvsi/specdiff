# Spring Boot example

```sh
pnpm --filter @specdiff/embed build                     # the Viewer bundled into the starter
(cd packages/spring-boot-starter && mvn install)         # local install only
cd examples/spring-boot && mvn spring-boot:run
```

Open http://localhost:8080/specdiff. springdoc serves the app's OpenAPI document at `/v3/api-docs`; the starter reads it. Options: `specdiff.path`, `specdiff.spec-url`, `specdiff.compare-with`, `specdiff.brand-color`, `specdiff.logo-url`, `specdiff.title`, `specdiff.enabled`.
