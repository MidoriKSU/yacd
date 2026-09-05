## yacd v0.4.0

This is the first official release of the **MidoriKSU/yacd** fork, continuing from upstream yacd `v0.3.8`.

### Highlights

- **Foundation for Native sing-box Service API**:
  Introduces client architecture, proto definitions, and connection handling for sing-box Service API via gRPC-Web.
- **Dual-API Configuration & Bootstrap**:
  Provides independent configuration and lifecycle management for both Clash API and sing-box Service API. Neither API being unconfigured blocks or crashes dashboard usage.
- **Clash Compatibility Preserved**:
  Retains full proxy groups, provider management, connection tracking, and rule inspection powered by standard Clash API.
- **Deployable Dashboard ZIP for sing-box**:
  The packaged release artifact (`yacd-v0.4.0.zip`) contains deployable production dashboard files at its root, ready for direct use with sing-box `experimental.clash_api.external_ui_download_url`.

### sing-box Configuration Example

```json
{
  "experimental": {
    "clash_api": {
      "external_controller": "127.0.0.1:9090",
      "external_ui": "yacd",
      "external_ui_download_url": "https://github.com/MidoriKSU/yacd/releases/download/v0.4.0/yacd-v0.4.0.zip"
    }
  }
}
```
