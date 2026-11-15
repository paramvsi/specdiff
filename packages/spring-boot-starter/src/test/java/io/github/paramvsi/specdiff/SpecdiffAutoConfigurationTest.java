package io.github.paramvsi.specdiff;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"specdiff.compare-with=/openapi-1.5.json", "specdiff.brand-color=#0B5FFF"})
@AutoConfigureMockMvc
class SpecdiffAutoConfigurationTest {

  @SpringBootApplication
  static class App {}

  @Autowired MockMvc mvc;

  @Test
  void redirectsAndForwardsToTheViewer() throws Exception {
    mvc.perform(get("/specdiff")).andExpect(redirectedUrl("/specdiff/"));
    mvc.perform(get("/specdiff/")).andExpect(forwardedUrl("/specdiff/index.html"));
  }

  @Test
  void servesTheViewerPage() throws Exception {
    mvc.perform(get("/specdiff/index.html")).andExpect(status().isOk());
    mvc.perform(get("/specdiff/boot.js")).andExpect(status().isOk());
    mvc.perform(get("/specdiff/assets/specdiff-embed.js")).andExpect(status().isOk());
    mvc.perform(get("/specdiff/assets/specdiff-compare.js")).andExpect(status().isOk());
  }

  @Test
  void configPointsAtTheAppsOpenApiDocument() throws Exception {
    mvc.perform(get("/specdiff/config.json"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.url").value("/v3/api-docs"))
        .andExpect(jsonPath("$.compareWith").value("/openapi-1.5.json"))
        .andExpect(jsonPath("$.brand.color").value("#0B5FFF"));
  }
}
