package io.github.paramvsi.specdiff;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.function.RouterFunction;
import org.springframework.web.servlet.function.RouterFunctions;
import org.springframework.web.servlet.function.ServerResponse;

/** Serves the built Specdiff Viewer from the jar at {@code specdiff.path} (default {@code /specdiff}). */
@AutoConfiguration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnClass(WebMvcConfigurer.class)
@ConditionalOnProperty(prefix = "specdiff", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(SpecdiffProperties.class)
public class SpecdiffAutoConfiguration {

  static final String RESOURCES = "classpath:/META-INF/specdiff/";

  @Bean
  WebMvcConfigurer specdiffWebMvcConfigurer(SpecdiffProperties props) {
    String base = props.normalisedPath();
    return new WebMvcConfigurer() {
      @Override
      public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler(base + "/assets/**")
            .addResourceLocations(RESOURCES + "assets/")
            .setCacheControl(CacheControl.maxAge(java.time.Duration.ofDays(365)).cachePublic().immutable());
        registry.addResourceHandler(base + "/**").addResourceLocations(RESOURCES).setCacheControl(CacheControl.noCache());
      }

      @Override
      public void addViewControllers(ViewControllerRegistry registry) {
        registry.addRedirectViewController(base, base + "/");
        registry.addViewController(base + "/").setViewName("forward:" + base + "/index.html");
      }
    };
  }

  /** The page reads this to know which spec to render. No inline script, so a strict CSP works. */
  @Bean
  RouterFunction<ServerResponse> specdiffConfigRoute(SpecdiffProperties props) {
    return RouterFunctions.route()
        .GET(props.normalisedPath() + "/config.json", req -> {
          Map<String, Object> body = new LinkedHashMap<>();
          body.put("url", props.getSpecUrl());
          if (props.getCompareWith() != null) body.put("compareWith", props.getCompareWith());
          if (props.getBrandColor() != null || props.getLogoUrl() != null) {
            Map<String, String> brand = new LinkedHashMap<>();
            if (props.getBrandColor() != null) brand.put("color", props.getBrandColor());
            if (props.getLogoUrl() != null) brand.put("logo", props.getLogoUrl());
            body.put("brand", brand);
          }
          body.put("title", props.getTitle());
          return ServerResponse.ok().contentType(MediaType.APPLICATION_JSON).cacheControl(CacheControl.noCache()).body(body);
        })
        .build();
  }

}
