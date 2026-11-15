package example;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class PaymentsAppTest {
  @Autowired MockMvc mvc;

  @Test
  void servesTheViewerAtSpecdiffReadingTheAppsOpenApiDocument() throws Exception {
    mvc.perform(get("/specdiff/")).andExpect(forwardedUrl("/specdiff/index.html"));
    mvc.perform(get("/specdiff/assets/specdiff-embed.js")).andExpect(status().isOk());
    mvc.perform(get("/specdiff/config.json")).andExpect(jsonPath("$.url").value("/v3/api-docs"));
    mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andExpect(jsonPath("$.paths['/v1/payments'].post").exists());
  }
}
