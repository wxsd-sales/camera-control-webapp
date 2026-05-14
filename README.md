# Camera Control Web App

This static web app pairs a browser with a Cisco collaboration device over USB-C and controls the device camera through the Webex datachannel.

## Overview

The app signs in with Webex, registers the browser as a Webex device, and requests the USB-C proximity token from the Cisco HID relay interface. The token is used to join the proximity Lyra space and connect the Webex LLM datachannel. Camera status, product platform, mode changes, pan/tilt/zoom, and preset commands are sent over that datachannel; USB HID is only used to request and renew the pairing token.

## Prerequisites

- Chrome or Edge with WebHID support.
- A Cisco collaboration device connected to the computer over USB-C.
- A Webex OAuth integration whose redirect URI matches the deployed page URL.
- Network access to Webex services and the Webex JavaScript SDK CDN.

## Run Locally

Serve the app from `http://` or `https://`; Webex sign-in and WebHID do not work from a raw `file://` page.

```sh
python3 -m http.server 5501
```

Then open `http://127.0.0.1:5501/` and sign in with Webex.

## Live Demo

A live GitHub Pages demo is available at [https://wxsd-sales.github.io/camera-control-webapp/](https://wxsd-sales.github.io/camera-control-webapp/).

## Test

```sh
npm test
```

The test script performs a JavaScript syntax check for `script.js`.

## License

All contents are licensed under the MIT license. Please see [LICENSE](LICENSE) for details.

## Disclaimer

Everything included is for demo and Proof of Concept purposes only. Use of the site is solely at your own risk. This site may contain links to third party content, which we do not warrant, endorse, or assume liability for. These demos are for Cisco Webex use cases, but are not official Cisco Webex branded demos.

## Questions

Please contact the WXSD team at [wxsd@external.cisco.com](mailto:wxsd@external.cisco.com?subject=camera-control-webapp) for questions.
