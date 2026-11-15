package io.github.paramvsi.specdiff;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code specdiff.*} properties. */
@ConfigurationProperties(prefix = "specdiff")
public class SpecdiffProperties {
  /** Turn the Viewer off without removing the dependency. */
  private boolean enabled = true;
  /** Where the Viewer is served. */
  private String path = "/specdiff";
  /** The OpenAPI document to render. springdoc serves it at /v3/api-docs. */
  private String specUrl = "/v3/api-docs";
  /** An older version to compare with, for change badges and "What changed". Optional. */
  private String compareWith;
  /** Brand colour for the embedded Viewer, as a CSS colour. Optional. */
  private String brandColor;
  /** Logo URL shown in the Viewer header. Optional. */
  private String logoUrl;
  /** Title shown in the browser tab. */
  private String title = "API reference";

  public boolean isEnabled() { return enabled; }
  public void setEnabled(boolean enabled) { this.enabled = enabled; }
  public String getPath() { return path; }
  public void setPath(String path) { this.path = path; }
  public String getSpecUrl() { return specUrl; }
  public void setSpecUrl(String specUrl) { this.specUrl = specUrl; }
  public String getCompareWith() { return compareWith; }
  public void setCompareWith(String compareWith) { this.compareWith = compareWith; }
  public String getBrandColor() { return brandColor; }
  public void setBrandColor(String brandColor) { this.brandColor = brandColor; }
  public String getLogoUrl() { return logoUrl; }
  public void setLogoUrl(String logoUrl) { this.logoUrl = logoUrl; }
  public String getTitle() { return title; }
  public void setTitle(String title) { this.title = title; }

  /** Path without a trailing slash, always starting with one. */
  String normalisedPath() {
    String p = path.startsWith("/") ? path : "/" + path;
    return p.endsWith("/") ? p.substring(0, p.length() - 1) : p;
  }
}
