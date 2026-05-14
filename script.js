const CONFIG = {
  clientId: "Cc2b3270aea1c78f582ddccacd21a6bcb227b337a8a9a485b15920d4dbc758110",
  oauthAuthorizeUrl: "https://webexapis.com/v1/authorize",
  oauthRedirectUri: `${window.location.origin}${window.location.pathname}`,
  oauthScopes: ["spark:all", "spark:kms"],
  oauthStoragePrefix: "camera_control_webex",
  targetDeviceIdentity: getHashParam("device_identity") || getHashParam("to"),
  hidRelayUsagePage: 0xff01,
  hidRelayUsage: 0x01,
  hidFilters: [
    { vendorId: 0x05a6, productId: 0x0b05, usagePage: 0xff01, usage: 0x01 },
    { vendorId: 0x05a6, productId: 0x0b0c, usagePage: 0xff01, usage: 0x01 },
    { vendorId: 0x05a6, productId: 0x0b0e, usagePage: 0xff01, usage: 0x01 },
    { vendorId: 0x05a6, productId: 0x0b10, usagePage: 0xff01, usage: 0x01 },
    { vendorId: 0x05a6, productId: 0x0b15, usagePage: 0xff01, usage: 0x01 },
    { vendorId: 0x05a6, productId: 0x0b17, usagePage: 0xff01, usage: 0x01 },
    { vendorId: 0x05a6, productId: 0x0b23, usagePage: 0xff01, usage: 0x01 },
    { vendorId: 0x05a6, productId: 0x0B1B, usagePage: 0xff01, usage: 0x01 },
  ],
  hidOutputReportId: 0x02,
  hidReportByteLength: 63,
  llmOnlineTimeoutMs: 20000,
};

const RELAY = {
  eventType: "relay.event",
  xapiRequestRelayType: "xapi.request",
  xapiResponseRelayType: "xapi.response",
};

const CAMERA_STATUS_QUERY = ["Status", "Cameras"];
const PRODUCT_PLATFORM_QUERY = ["Status", "SystemUnit", "ProductPlatform"];
const PRESET_SLOTS = [1, 2, 3, 4, 5];
const CAMERA_RAMP_SPEED = 5;

const SPEAKER_TRACK_BEHAVIORS_BY_PRODUCT = [
  {
    products: [
      "Board Pro 55 G2",
      "Board Pro 75 G2",
      "Codec EQ",
      "Codec Pro",
      "Room 70 Dual G2",
      "Room 70 Single G2",
      "Room Bar Pro",
    ],
    behaviors: [
      "Manual",
      "Dynamic",
      "BestOverview",
      "Closeup",
      "Frames",
      "GroupAndSpeaker",
    ],
  },
  {
    products: ["Desk", "Desk Mini", "Desk Pro"],
    behaviors: ["Manual", "BestOverview"],
  },
  {
    products: [
      "Board Pro 55",
      "Board Pro 75",
      "Room 70 Panorama",
      "Room Bar",
      "Room Panorama",
    ],
    behaviors: ["Manual", "Dynamic", "BestOverview", "Closeup", "Frames"],
  },
];

const CAMERA_MODE_DEFINITIONS = [
  {
    id: "Manual",
    label: "Manual",
    behavior: "Manual",
    method: "xCommand/Cameras/SpeakerTrack/Set",
    params: { Behavior: "Manual" },
    isActive: (status) => ["Manual", "Off"].includes(getActiveCameraBehavior(status)),
  },
  {
    id: "BestOverview",
    label: "Best Overview",
    behavior: "BestOverview",
    method: "xCommand/Cameras/SpeakerTrack/Set",
    params: { Behavior: "BestOverview" },
    isActive: (status) =>
      getActiveCameraBehavior(status) === "BestOverview" ||
      getPath(status, "SpeakerTrack.State") === "BestOverview" ||
      getPath(status, "speakerTrack.state") === "BestOverview",
  },
  {
    id: "Closeup",
    label: "Closeup",
    behavior: "Closeup",
    method: "xCommand/Cameras/SpeakerTrack/Set",
    params: { Behavior: "Closeup" },
    isActive: (status) =>
      getActiveCameraBehavior(status) === "Closeup" ||
      getPath(status, "SpeakerTrack.Closeup.Status") === "Active" ||
      getPath(status, "speakerTrack.closeup.status") === "Active",
  },
  {
    id: "Frames",
    label: "Frames",
    behavior: "Frames",
    method: "xCommand/Cameras/SpeakerTrack/Set",
    params: { Behavior: "Frames" },
    isActive: (status) =>
      getActiveCameraBehavior(status) === "Frames" ||
      getPath(status, "SpeakerTrack.Frames.Status") === "Active" ||
      getPath(status, "speakerTrack.frames.status") === "Active",
  },
  {
    id: "Dynamic",
    label: "Dynamic",
    behavior: "Dynamic",
    method: "xCommand/Cameras/SpeakerTrack/Set",
    params: { Behavior: "Dynamic" },
    isActive: (status) => getActiveCameraBehavior(status) === "Dynamic",
  },
  {
    id: "GroupAndSpeaker",
    label: "Group + Speaker",
    behavior: "GroupAndSpeaker",
    method: "xCommand/Cameras/SpeakerTrack/Set",
    params: { Behavior: "GroupAndSpeaker" },
    isActive: (status) => getActiveCameraBehavior(status) === "GroupAndSpeaker",
  },
];

const STEP_LABELS = {
  idle: "Waiting",
  blocked: "Blocked",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
  granted: "Granted",
  needed: "Needed",
  pending: "Pending",
  ready: "Ready",
  requesting: "Requesting",
  received: "Received",
  unavailable: "Unavailable",
};

const app = {
  dom: {},
  webex: null,
  webexReady: false,
  webexRegistered: false,
  oauthCredentials: null,
  usbConnectionConfirmed: false,
  hidDevice: null,
  hidOpened: false,
  hidRelayCollection: null,
  hidOutputReportId: CONFIG.hidOutputReportId,
  hidOutputReportByteLength: CONFIG.hidReportByteLength,
  hidInputReportIds: new Set(),
  hidBuffers: new Map(),
  relayRequestId: 0,
  pairingInFlight: null,
  proximityRefreshInFlight: null,
  tokenRequestInFlight: false,
  hidNonTokenRelayIgnored: false,
  usbcTokenRefreshTimer: null,
  state: {
    webex: "idle",
    usb: "idle",
    permission: "needed",
    token: "idle",
    pairing: "idle",
    dataChannel: "idle",
  },
  usbcToken: null,
  advertisedEndpoint: null,
  lyraSpace: null,
  datachannelUrl: null,
  pairedDevice: null,
  targetDeviceIdentity: CONFIG.targetDeviceIdentity,
  productPlatform: null,
  cameraStatus: null,
  availableCameras: [],
  cameraModes: [],
  cameraPresets: [],
  savePresetPickerOpen: false,
  xapiRequests: new Map(),
  logs: [],
};

window.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  app.dom = collectDom();
  bindUiEvents();
  initializeAuth();
  render();

  if (app.oauthCredentials) {
    initializeWebex();
  }

  await initializeHid();

  window.cameraControlPairing = {
    get state() {
      return {
        ...app.state,
        device: describeHidDevice(app.hidDevice),
        signedIn: Boolean(app.oauthCredentials),
        hasToken: Boolean(app.usbcToken),
        datachannelUrl: app.datachannelUrl,
        targetDeviceIdentity: resolveTargetDeviceIdentity(),
        productPlatform: app.productPlatform,
        cameraStatus: app.cameraStatus,
        availableCameras: app.availableCameras,
        cameraModes: app.cameraModes,
        cameraPresets: app.cameraPresets,
      };
    },
    requestUsbcToken,
    pairWithCurrentToken,
    startWebexLogin,
    signOutOfWebex,
    sendXapiOverUsbRelay,
    sendXapiOverDataChannel,
    requestCameraDataOverDataChannel,
    requestProductPlatformOverDataChannel,
    requestCameraStatusOverDataChannel,
    requestCameraPresetsOverDataChannel,
    setTargetDeviceIdentity,
  };
}

function collectDom() {
  return {
    alert: document.querySelector("#alert"),
    connectGuide: document.querySelector("#connectGuide"),
    webexState: document.querySelector("#webexState"),
    usbState: document.querySelector("#usbState"),
    permissionState: document.querySelector("#permissionState"),
    tokenState: document.querySelector("#tokenState"),
    pairingState: document.querySelector("#pairingState"),
    dataChannelState: document.querySelector("#dataChannelState"),
    deviceName: document.querySelector("#deviceName"),
    deviceDetail: document.querySelector("#deviceDetail"),
    pairingDeviceName: document.querySelector("#pairingDeviceName"),
    pairingDeviceDetail: document.querySelector("#pairingDeviceDetail"),
    grantHidBtn: document.querySelector("#grantHidBtn"),
    confirmUsbBtn: document.querySelector("#confirmUsbBtn"),
    signInBtn: document.querySelector("#signInBtn"),
    signOutBtn: document.querySelector("#signOutBtn"),
    refreshCamerasBtn: document.querySelector("#refreshCamerasBtn"),
    cameraInventory: document.querySelector("#cameraInventory"),
    cameraModeControls: document.querySelector("#cameraModeControls"),
    presetControls: document.querySelector("#presetControls"),
    manualCameraControls: document.querySelector("#manualCameraControls"),
    saveCameraViewBtn: document.querySelector("#saveCameraViewBtn"),
    savePresetControls: document.querySelector("#savePresetControls"),
    stepPanels: [...document.querySelectorAll("[data-step]")],
    eventLog: document.querySelector("#eventLog"),
  };
}

function bindUiEvents() {
  app.dom.signInBtn?.addEventListener("click", startWebexLogin);
  app.dom.signOutBtn?.addEventListener("click", signOutOfWebex);
  app.dom.confirmUsbBtn?.addEventListener("click", confirmUsbConnection);
  app.dom.grantHidBtn.addEventListener("click", requestHidPermission);
  app.dom.refreshCamerasBtn?.addEventListener("click", requestCameraDataOverDataChannel);
  app.dom.saveCameraViewBtn?.addEventListener("click", toggleSavePresetPicker);
  app.dom.manualCameraControls
    ?.querySelectorAll("[data-ramp-axis][data-ramp-direction]")
    .forEach(bindCameraRampButton);
}

function confirmUsbConnection() {
  app.usbConnectionConfirmed = true;
  addLog("USB-C device connection confirmed. Requesting browser HID permission next.");
  render();
}

function initializeAuth() {
  const urlCredentials = getOAuthCredentialsFromUrl();
  const credentials = urlCredentials || getStoredOAuthCredentials();

  if (!credentials) {
    setState({ webex: "needed" });
    addLog("Sign in with Webex to register the browser and pair with the USB-C device.");
    return;
  }

  if (isOAuthCredentialExpired(credentials)) {
    clearStoredOAuthCredentials();
    setState({ webex: "needed" });
    addLog("Stored Webex sign-in expired. Sign in with Webex again.", "error");
    return;
  }

  app.oauthCredentials = credentials;
  saveOAuthCredentials(credentials);
}

function startWebexLogin() {
  if (!CONFIG.clientId) {
    setState({ webex: "blocked" });
    addLog("Webex sign-in blocked: no OAuth client ID is configured.", "error");
    return;
  }

  if (!isHostedWebApp()) {
    setState({ webex: "blocked" });
    addLog("Webex sign-in needs this app to be served from http:// or https://.", "error");
    return;
  }

  const state = createUuid();
  const params = new URLSearchParams({
    client_id: CONFIG.clientId,
    response_type: "token",
    redirect_uri: CONFIG.oauthRedirectUri,
    scope: CONFIG.oauthScopes.join(" "),
    state,
  });

  sessionStorage.setItem(getOAuthStorageKey("state"), state);
  addLog("Redirecting to Webex sign-in.");
  window.location.assign(`${CONFIG.oauthAuthorizeUrl}?${params.toString()}`);
}

async function signOutOfWebex() {
  const accessToken = app.oauthCredentials?.accessToken;

  try {
    await app.webex?.internal?.llm?.disconnectLLM?.();
  } catch (error) {
    addLog(`LLM disconnect during sign-out failed: ${formatError(error)}`, "error");
  }

  clearStoredOAuthCredentials();
  app.oauthCredentials = null;
  app.webex = null;
  app.webexReady = false;
  app.webexRegistered = false;
  app.pairingInFlight = null;
  app.proximityRefreshInFlight = null;
  clearUsbcTokenRefreshTimer();
  app.datachannelUrl = null;
  app.pairedDevice = null;
  app.lyraSpace = null;
  app.productPlatform = null;
  app.cameraStatus = null;
  app.availableCameras = [];
  app.cameraModes = [];
  app.cameraPresets = [];
  app.savePresetPickerOpen = false;
  app.xapiRequests.clear();
  setState({ webex: "needed", pairing: "idle", dataChannel: "idle" });

  if (accessToken) {
    revokeWebexToken(accessToken).catch((error) => {
      addLog(`Webex token revoke failed: ${formatError(error)}`, "error");
    });
  }

  addLog("Signed out of Webex.");
}

async function revokeWebexToken(accessToken) {
  await fetch("https://idbroker.webex.com/idb/oauth2/v1/tokens/me?authtoken=true", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

function initializeWebex() {
  if (!window.Webex) {
    setState({ webex: "unavailable" });
    addLog("Webex SDK was not loaded. Check the CDN script in index.html.", "error");
    return;
  }

  if (!app.oauthCredentials?.accessToken) {
    setState({ webex: "needed" });
    addLog("No Webex sign-in token is available for this session.", "error");
    return;
  }

  setState({ webex: "pending" });

  app.webex = window.Webex.init({
    credentials: { access_token: app.oauthCredentials.accessToken },
  });

  app.webex.on("ready", async () => {
    app.webexReady = true;
    setState({ webex: "pending" });
    addLog("Webex SDK is ready. Registering this browser as a Webex device.");

    try {
      await app.webex.meetings.register();
      app.webexRegistered = true;
      setState({ webex: "ready" });
      addLog("Webex device registration and Mercury connection are ready.");
      wireWebexEvents();
      await pairWithCurrentToken();
    } catch (error) {
      setState({ webex: "error" });
      addLog(`Webex registration failed: ${formatError(error)}`, "error");
    }
  });

  app.webex.on?.("error", (error) => {
    setState({ webex: "error" });
    addLog(`Webex SDK error: ${formatError(error)}`, "error");
  });
}

function wireWebexEvents() {
  const mercury = app.webex?.internal?.mercury;
  const llm = app.webex?.internal?.llm;

  if (mercury) {
    mercury.off?.("event:lyra.space_updated", handleLyraSpaceUpdated);
    mercury.on("event:lyra.space_updated", handleLyraSpaceUpdated);
  }

  if (llm) {
    llm.off?.("event:relay.event", handleLlmRelayEvent);
    llm.on("event:relay.event", handleLlmRelayEvent);
    llm.off?.("online", handleLlmOnline);
    llm.on("online", handleLlmOnline);
    llm.off?.("offline", handleLlmOffline);
    llm.on("offline", handleLlmOffline);
  }
}

async function initializeHid() {
  if (!("hid" in navigator)) {
    setState({ usb: "unavailable", permission: "unavailable" });
    addLog("WebHID is unavailable. Use Chrome or Edge on a secure origin.", "error");
    return;
  }

  navigator.hid.addEventListener("connect", handleHidConnect);
  navigator.hid.addEventListener("disconnect", handleHidDisconnect);

  await restoreAuthorizedHidDevice();
}

async function restoreAuthorizedHidDevice() {
  setState({ usb: "pending", permission: "needed" });

  try {
    const devices = await navigator.hid.getDevices();
    const device = findCiscoHidDevice(devices, { requireRelay: true });

    if (!device) {
      app.usbConnectionConfirmed = false;
      setState({ usb: "disconnected", permission: "needed" });
      addLog("No authorized Cisco USB HID relay device was found for this browser origin.");
      return;
    }

    setState({ permission: "granted" });
    await useHidDevice(device);
  } catch (error) {
    setState({ usb: "error", permission: "error" });
    addLog(`Could not inspect HID devices: ${formatError(error)}`, "error");
  }
}

async function requestHidPermission() {
  if (!("hid" in navigator)) {
    setState({ usb: "unavailable", permission: "unavailable" });
    return;
  }

  app.usbConnectionConfirmed = true;
  setState({ permission: "pending" });

  try {
    const devices = await navigator.hid.requestDevice({
      filters: CONFIG.hidFilters,
    });
    const device = findCiscoHidDevice(devices, { requireRelay: true });

    if (!device) {
      app.usbConnectionConfirmed = false;
      setState({ usb: "disconnected", permission: "needed" });
      addLog("No Cisco collaboration HID relay device was selected.");
      return;
    }

    setState({ permission: "granted" });
    await useHidDevice(device);
  } catch (error) {
    const nextUsbState = app.hidDevice ? "connected" : "disconnected";

    app.usbConnectionConfirmed = Boolean(app.hidDevice);
    setState({ usb: nextUsbState, permission: "needed" });
    addLog(`USB HID permission was not granted: ${formatError(error)}`, "error");
  }
}

async function handleHidConnect(event) {
  if (!isCiscoHidDevice(event.device) || !findHidRelayCollection(event.device)) {
    return;
  }

  addLog(`Cisco USB HID device connected: ${event.device.productName || "Unknown device"}.`);
  app.usbConnectionConfirmed = true;
  setState({ permission: "granted" });
  await useHidDevice(event.device);
}

function handleHidDisconnect(event) {
  if (!app.hidDevice || event.device !== app.hidDevice) {
    return;
  }

  app.hidDevice?.removeEventListener?.("inputreport", handleInputReport);
  app.hidDevice = null;
  app.hidOpened = false;
  app.hidNonTokenRelayIgnored = false;
  resetHidRelayState();
  app.usbConnectionConfirmed = false;
  clearUsbcTokenRefreshTimer();
  app.hidBuffers.clear();
  setState({ usb: "disconnected", token: "idle" });
  addLog("Cisco USB HID device disconnected.", "error");
}

async function useHidDevice(device) {
  if (app.hidDevice && app.hidDevice !== device) {
    app.hidDevice.removeEventListener("inputreport", handleInputReport);
  }

  app.hidDevice = device;
  app.usbConnectionConfirmed = true;
  app.hidNonTokenRelayIgnored = false;
  app.hidDevice.removeEventListener("inputreport", handleInputReport);
  app.hidDevice.addEventListener("inputreport", handleInputReport);

  setState({ usb: "pending", permission: "granted" });

  try {
    if (!device.opened) {
      await device.open();
    }

    app.hidOpened = device.opened;
    configureHidRelay(device);
    setState({ usb: "connected" });
    addLog(`USB HID is open for ${device.productName || "Cisco collaboration device"}.`);
    logHidCollections(device);
    await requestUsbcToken();
  } catch (error) {
    app.hidOpened = false;
    resetHidRelayState();
    setState({ usb: "error" });
    addLog(`Could not open or configure the USB HID device: ${formatError(error)}`, "error");
  }
}

async function requestUsbcToken() {
  if (!app.hidDevice) {
    app.usbConnectionConfirmed = false;
    setState({ usb: "disconnected", permission: "needed" });
    addLog("Connect and grant access to the Cisco USB HID device first.", "error");
    return;
  }

  if (app.tokenRequestInFlight) {
    return;
  }

  app.tokenRequestInFlight = true;
  setState({ token: "requesting" });

  try {
    if (!app.hidDevice.opened) {
      await app.hidDevice.open();
    }

    app.hidOpened = app.hidDevice.opened;
    if (!app.hidRelayCollection) {
      configureHidRelay(app.hidDevice);
    }
    setState({ usb: "connected" });

    const payload = createRelayRequest("xFeedback/Subscribe", {
      NotifyCurrentValue: true,
      Query: ["Status"],
    });

    await sendHidPayload(payload);
    addLog("USB-C proximity token request sent over HID.");
  } catch (error) {
    setState({ token: "error" });
    addLog(`Could not request the USB-C token: ${formatError(error)}`, "error");
  } finally {
    app.tokenRequestInFlight = false;
    render();
  }
}

async function sendXapiOverUsbRelay(method, params = {}) {
  addLog(
    `USB HID relay is only used for the USB-C token request. Sending ${method} over datachannel instead.`
  );
  return sendXapiOverDataChannel(method, params);
}

async function sendXapiOverDataChannel(method, params = {}, options = {}) {
  const relayData = createXapiRequestRelayData(method, params);
  const successMessage =
    options.successMessage === null
      ? null
      : options.successMessage || `Sent XAPI request over datachannel: ${method}.`;

  app.xapiRequests.set(relayData.request.id, {
    method,
    params,
    quiet: options.quiet === true || options.successMessage === null,
    sentAt: Date.now(),
  });

  const sent = await sendRelayDataOverDataChannel(
    relayData,
    successMessage,
    options
  );

  if (!sent) {
    app.xapiRequests.delete(relayData.request.id);
  }

  return sent;
}

async function requestCameraDataOverDataChannel() {
  const productSent = await requestProductPlatformOverDataChannel();
  const statusSent = await requestCameraStatusOverDataChannel();
  const presetsSent = await requestCameraPresetsOverDataChannel();

  return Boolean(productSent || statusSent || presetsSent);
}

async function requestProductPlatformOverDataChannel() {
  return sendXapiOverDataChannel(
    "xFeedback/Subscribe",
    {
      NotifyCurrentValue: true,
      Query: PRODUCT_PLATFORM_QUERY,
    },
    {
      logTargetErrors: false,
      successMessage: "Requested product platform over datachannel.",
    }
  );
}

async function requestCameraStatusOverDataChannel() {
  return sendXapiOverDataChannel(
    "xFeedback/Subscribe",
    {
      NotifyCurrentValue: true,
      Query: CAMERA_STATUS_QUERY,
    },
    {
      logTargetErrors: false,
      successMessage: "Requested camera status over datachannel.",
    }
  );
}

async function requestCameraPresetsOverDataChannel() {
  return sendXapiOverDataChannel(
    "xCommand/Camera/Preset/List",
    {},
    {
      logTargetErrors: false,
      successMessage: "Requested saved camera presets over datachannel.",
    }
  );
}

async function sendRelayDataOverDataChannel(relayData, successMessage, options = {}) {
  const llm = app.webex?.internal?.llm;
  const targetDeviceIdentity = resolveTargetDeviceIdentity();
  const { logTargetErrors = true } = options;

  if (!llm?.socket || !llm.isConnected?.()) {
    addLog("Datachannel command blocked: LLM datachannel is not connected.", "error");
    return false;
  }

  if (!llm.getBinding?.()) {
    addLog("Datachannel command blocked: no LLM binding is available.", "error");
    return false;
  }

  if (!targetDeviceIdentity) {
    if (logTargetErrors) {
      addLog("Datachannel command blocked: no paired device identity was found.", "error");
    }
    return false;
  }

  const publishRequest = createLlmPublishRequest(relayData, targetDeviceIdentity);

  try {
    const result = llm.socket.send(publishRequest);

    if (result?.then) {
      await result;
    }

    if (successMessage) {
      addLog(successMessage);
    }
    return true;
  } catch (error) {
    addLog(`Datachannel XAPI relay failed: ${formatError(error)}`, "error");
    return false;
  }
}

function createXapiRequestRelayData(method, params = {}) {
  const requestId = createUuid();

  return {
    eventType: RELAY.eventType,
    id: requestId,
    relayType: RELAY.xapiRequestRelayType,
    request: {
      id: requestId,
      jsonrpc: "2.0",
      method,
      params,
    },
  };
}

function createLlmPublishRequest(relayData, targetDeviceIdentity) {
  const llm = app.webex?.internal?.llm;

  return {
    type: "publishRequest",
    id: createUuid(),
    trackingId: `CLIENT_${createUuid()}`,
    recipients: {
      route: llm?.getBinding?.(),
    },
    data: relayData,
    headers: {
      to: targetDeviceIdentity,
    },
  };
}

function resolveTargetDeviceIdentity() {
  const identity =
    app.targetDeviceIdentity ||
    findFirstString(app.pairedDevice, ["id", "identity.id", "identity.url", "url"]) ||
    findFirstString(app.lyraSpace, ["id", "identity.id", "identity.url", "url"]) ||
    findFirstString(app.advertisedEndpoint, [
      "advertiser.id",
      "advertiser.identity",
      "advertiser.identity.id",
      "id",
      "identity.id",
    ]);

  return normalizeDeviceIdentity(identity);
}

function setTargetDeviceIdentity(identity) {
  app.targetDeviceIdentity = normalizeDeviceIdentity(identity);
  addLog(`Target device identity ${app.targetDeviceIdentity ? "updated" : "cleared"}.`);
  render();
}

function createRelayRequest(method, params = {}) {
  const requestId = String(++app.relayRequestId);

  return {
    id: requestId,
    request: {
      eventType: "relay.event",
      id: requestId,
      method,
      params,
      relayType: "xapi.request",
    },
  };
}

async function sendHidPayload(payload) {
  const reportId = app.hidOutputReportId ?? CONFIG.hidOutputReportId;
  const reportByteLength = app.hidOutputReportByteLength || CONFIG.hidReportByteLength;
  const packetLengths = [
    reportByteLength,
    reportByteLength - 1,
    reportByteLength + 1,
  ].filter((length, index, lengths) => length >= 4 && lengths.indexOf(length) === index);
  let firstError = null;
  const attemptErrors = [];

  for (const packetLength of packetLengths) {
    try {
      await sendHidPacketSequence(reportId, jsonToHidPackets(payload, packetLength));

      if (packetLength !== reportByteLength) {
        app.hidOutputReportByteLength = packetLength;
        addLog(`HID write succeeded with ${packetLength} byte output reports.`);
      }

      return;
    } catch (error) {
      if (!firstError) {
        firstError = error;
      }
      attemptErrors.push(`${packetLength}b: ${formatError(error.cause || error)}`);

      if (error.packetIndex > 0) {
        throw error.cause || error;
      }

      addLog(
        `HID write failed for report ${formatHidReportId(reportId)} with ${packetLength} byte reports: ${formatError(
          error.cause || error
        )}.`
      );
    }
  }

  const error = new Error(`Failed to write the HID report (${attemptErrors.join("; ")}).`);

  error.cause = firstError?.cause || firstError;
  throw error;
}

async function sendHidPacketSequence(reportId, packets) {
  for (const [packetIndex, packet] of packets.entries()) {
    try {
      await app.hidDevice.sendReport(reportId, packet);
    } catch (cause) {
      const error = new Error(formatError(cause));

      error.cause = cause;
      error.packetIndex = packetIndex;
      throw error;
    }
  }
}

function handleInputReport(event) {
  try {
    if (!isRelayInputReport(event.reportId)) {
      return;
    }

    const payload = parseHidInputReport(event);

    if (!payload) {
      return;
    }

    addLog(`Received HID relay payload for report ${event.reportId}.`);
    handleRelayPayload(payload, "hid");
  } catch (error) {
    setState({ token: "error" });
    addLog(`Could not parse HID input report: ${formatError(error)}`, "error");
  }
}

function parseHidInputReport(event) {
  const view = event.data;
  const size = view.getUint8(0);
  const remaining = view.getUint16(1, false);
  const chunkSize = Math.min(size, Math.max(0, view.byteLength - 3));
  const chunk = new Uint8Array(view.buffer, view.byteOffset + 3, chunkSize);
  const reportBuffer = app.hidBuffers.get(event.reportId) || [];

  reportBuffer.push(new Uint8Array(chunk));

  if (remaining > 0) {
    app.hidBuffers.set(event.reportId, reportBuffer);
    return null;
  }

  app.hidBuffers.delete(event.reportId);
  const bytes = concatUint8Arrays(reportBuffer);
  const text = new TextDecoder("utf-8").decode(bytes);

  return JSON.parse(text);
}

function handleRelayPayload(payload, source) {
  const token = findNestedValue(payload, "UsbcToken");
  const relayData = getRelayData(payload);

  if (token) {
    const tokenWasAlreadyReceived = app.state.token === "received";

    app.usbcToken = token;
    if (!tokenWasAlreadyReceived) {
      setState({ token: "received" });
    }
    addLog(`USB-C proximity token received from ${source}.`);
    scheduleTokenRefreshFromRelayData(relayData, payload);
    pairWithCurrentToken();
    return;
  }

  if (source === "hid") {
    scheduleTokenRefreshFromRelayData(relayData, payload);

    if (!app.hidNonTokenRelayIgnored) {
      app.hidNonTokenRelayIgnored = true;
      addLog("Ignoring non-token XAPI data received over USB HID; device data uses datachannel.");
    }

    return;
  }

  if (isXapiRelayData(relayData)) {
    handleXapiRelayData(relayData, source);
    return;
  }

  addLog(`Relay payload received from ${source}; no USB-C token was present.`);
}

function isXapiRelayData(relayData) {
  return Boolean(
    relayData?.relayType?.startsWith?.("xapi.") ||
      relayData?.request?.jsonrpc ||
      relayData?.response?.jsonrpc ||
      relayData?.event?.jsonrpc
  );
}

function handleXapiRelayData(relayData, source) {
  const message = relayData.response || relayData.event || relayData.request || relayData;

  if (source === "hid") {
    scheduleTokenRefreshFromRelayData(relayData, message);
    return;
  }

  const messageId = message.id || relayData.id;
  const pendingRequest = app.xapiRequests.get(messageId);
  const method = message.method || pendingRequest?.method || relayData.relayType || "XAPI";
  const productPlatformUpdated = updateProductPlatformFromXapi(relayData, message, pendingRequest);
  const cameraStatusUpdated = updateCameraStatusFromXapi(relayData);
  const cameraPresetsUpdated = updateCameraPresetsFromXapi(message, pendingRequest);

  if (
    messageId &&
    (relayData.relayType === RELAY.xapiResponseRelayType ||
      message.result !== undefined ||
      message.error)
  ) {
    app.xapiRequests.delete(messageId);
  }

  if (message.error) {
    addLog(`XAPI error from ${source} for ${method}: ${formatXapiError(message.error)}`, "error");
    return;
  }

  if (productPlatformUpdated) {
    addLog(`Product platform received from ${source}: ${app.productPlatform}.`);
  }

  if (cameraStatusUpdated) {
    addLog(`Camera status received from ${source}: ${formatCameraList(app.availableCameras)}.`);
  }

  if (cameraPresetsUpdated) {
    addLog(`Saved camera presets received from ${source}: ${formatPresetList(app.cameraPresets)}.`);
  }

  if (productPlatformUpdated || cameraStatusUpdated || cameraPresetsUpdated) {
    return;
  }

  if (pendingRequest?.quiet) {
    return;
  }

  if (relayData.relayType === RELAY.xapiResponseRelayType || message.result !== undefined) {
    addLog(`XAPI response received from ${source} for ${method}.`);
    return;
  }

  addLog(`XAPI event received from ${source} for ${method}.`);
}

function getXapiSubscriptionSeconds(relayData, message) {
  const value = Number(message?.subscriptionSeconds ?? relayData?.subscriptionSeconds);

  return Number.isFinite(value) && value > 0 ? value : null;
}

function scheduleTokenRefreshFromRelayData(relayData, message) {
  const subscriptionSeconds = getXapiSubscriptionSeconds(relayData, message);

  if (subscriptionSeconds) {
    scheduleUsbcTokenRefresh(subscriptionSeconds);
  }
}

function scheduleUsbcTokenRefresh(subscriptionSeconds) {
  clearUsbcTokenRefreshTimer();

  const delayMs = Math.max(1, subscriptionSeconds) * 1000;

  app.usbcTokenRefreshTimer = window.setTimeout(() => {
    app.usbcTokenRefreshTimer = null;

    if (!app.hidDevice || !app.hidOpened) {
      return;
    }

    addLog("Renewing USB-C proximity token subscription.");
    requestUsbcToken();
  }, delayMs);

  addLog(`USB-C token subscription renewal scheduled in ${Math.round(subscriptionSeconds)} seconds.`);
}

function clearUsbcTokenRefreshTimer() {
  if (!app.usbcTokenRefreshTimer) {
    return;
  }

  window.clearTimeout(app.usbcTokenRefreshTimer);
  app.usbcTokenRefreshTimer = null;
}

function updateProductPlatformFromXapi(relayData, message, pendingRequest) {
  const productPlatform = extractProductPlatform(relayData, message, pendingRequest);

  if (!productPlatform || productPlatform === app.productPlatform) {
    return false;
  }

  app.productPlatform = productPlatform;

  if (refreshCameraModesFromCurrentState()) {
    render();
  }

  return true;
}

function updateCameraStatusFromXapi(value) {
  const cameraStatus = extractCameraStatus(value);

  if (!cameraStatus) {
    return false;
  }

  app.cameraStatus = mergeStatusObjects(app.cameraStatus || {}, cameraStatus);
  const nextCameras = normalizeCameraValue(app.cameraStatus.Camera || app.cameraStatus.camera);
  const nextModes = getAvailableCameraModes(app.cameraStatus, app.productPlatform);
  const cameraUiChanged =
    getCameraListSignature(app.availableCameras) !== getCameraListSignature(nextCameras) ||
    getCameraModeListSignature(app.cameraModes) !== getCameraModeListSignature(nextModes);

  if (!cameraUiChanged) {
    return false;
  }

  app.availableCameras = nextCameras;
  app.cameraModes = nextModes;
  render();
  return true;
}

function refreshCameraModesFromCurrentState() {
  const nextModes = getAvailableCameraModes(app.cameraStatus, app.productPlatform);

  if (getCameraModeListSignature(app.cameraModes) === getCameraModeListSignature(nextModes)) {
    return false;
  }

  app.cameraModes = nextModes;
  return true;
}

function updateCameraPresetsFromXapi(message, pendingRequest) {
  if (!isCameraPresetListResponse(message, pendingRequest)) {
    return false;
  }

  const nextPresets = normalizePresetValue(message.result?.Preset);

  if (getPresetListSignature(app.cameraPresets) === getPresetListSignature(nextPresets)) {
    return false;
  }

  app.cameraPresets = nextPresets;
  render();
  return true;
}

function extractCameraStatus(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 10) {
    return null;
  }

  const cameraStatus =
    getPath(value, "Status.Cameras") ||
    getPath(value, "status.cameras") ||
    value.Cameras ||
    value.cameras;

  if (isCameraStatusObject(cameraStatus)) {
    return cameraStatus;
  }

  if (isCameraStatusObject(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    const result = extractCameraStatus(child, depth + 1);

    if (result) {
      return result;
    }
  }

  return null;
}

function isCameraStatusObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (Object.prototype.hasOwnProperty.call(value, "Camera") ||
        Object.prototype.hasOwnProperty.call(value, "camera") ||
        Object.prototype.hasOwnProperty.call(value, "SpeakerTrack") ||
        Object.prototype.hasOwnProperty.call(value, "speakerTrack") ||
        Object.prototype.hasOwnProperty.call(value, "PresenterTrack") ||
        Object.prototype.hasOwnProperty.call(value, "presenterTrack"))
  );
}

function extractProductPlatform(relayData, message, pendingRequest) {
  if (isProductPlatformRequest(pendingRequest) && typeof message?.result === "string") {
    return stringifyStatusValue(message.result);
  }

  return (
    findProductPlatformValue(message) ||
    findProductPlatformValue(relayData) ||
    findProductPlatformValue(message?.result)
  );
}

function isProductPlatformRequest(pendingRequest) {
  return (
    normalizeXapiMethod(pendingRequest?.method) === "xfeedback/subscribe" &&
    xapiQueriesMatch(pendingRequest?.params?.Query, PRODUCT_PLATFORM_QUERY)
  );
}

function xapiQueriesMatch(query, expectedQuery) {
  const normalizeQueryPart = (part) => String(part || "").trim().toLowerCase();
  const queryParts = Array.isArray(query)
    ? query.map(normalizeQueryPart)
    : String(query || "")
        .split(/[/. ]+/)
        .filter(Boolean)
        .map(normalizeQueryPart);
  const expectedParts = expectedQuery.map(normalizeQueryPart);

  return (
    queryParts.length === expectedParts.length &&
    queryParts.every((part, index) => part === expectedParts[index])
  );
}

function findProductPlatformValue(value, depth = 0) {
  if (!value || depth > 10) {
    return null;
  }

  if (typeof value === "string") {
    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const productPlatform =
    getPath(value, "Status.SystemUnit.ProductPlatform") ||
    getPath(value, "status.systemUnit.productPlatform") ||
    getPath(value, "result.Status.SystemUnit.ProductPlatform") ||
    getPath(value, "result.status.systemUnit.productPlatform") ||
    getPath(value, "result.SystemUnit.ProductPlatform") ||
    getPath(value, "result.systemUnit.productPlatform") ||
    getPath(value, "result.ProductPlatform") ||
    getPath(value, "result.productPlatform") ||
    value.ProductPlatform ||
    value.productPlatform;

  const normalizedProductPlatform = stringifyProductPlatformValue(productPlatform);

  if (normalizedProductPlatform) {
    return normalizedProductPlatform;
  }

  for (const child of Object.values(value)) {
    const result = findProductPlatformValue(child, depth + 1);

    if (result) {
      return result;
    }
  }

  return null;
}

function stringifyProductPlatformValue(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  return stringifyProductPlatformValue(
    value.Value || value.value || value.Text || value.text || value.name
  );
}

function normalizeCameraValue(cameraValue) {
  if (Array.isArray(cameraValue)) {
    return cameraValue
      .map((camera, index) => createCameraEntry(camera, index + 1))
      .filter(Boolean);
  }

  if (!cameraValue || typeof cameraValue !== "object") {
    return [];
  }

  if (looksLikeSingleCamera(cameraValue)) {
    return [createCameraEntry(cameraValue, findCameraId(cameraValue) || 1)].filter(Boolean);
  }

  return Object.entries(cameraValue)
    .map(([id, camera]) => createCameraEntry(camera, id))
    .filter(Boolean);
}

function getAvailableCameraModes(status, productPlatform) {
  const supportedBehaviors = getSupportedSpeakerTrackBehaviors(productPlatform);

  if (!status || !supportedBehaviors) {
    return [];
  }

  return CAMERA_MODE_DEFINITIONS.filter((mode) =>
    isCameraModeAvailableForProduct(mode, status, supportedBehaviors)
  ).map((mode) => ({
    id: mode.id,
    label: mode.label,
    method: mode.method,
    params: mode.params,
    active: mode.isActive(status),
  }));
}

function isCameraModeAvailableForProduct(mode, status, supportedBehaviors) {
  if (!supportedBehaviors.includes(mode.behavior)) {
    return false;
  }

  if (mode.behavior === "Manual") {
    return hasSpeakerTrackStatus(status);
  }

  if (mode.behavior === "Frames" && isFramesUnavailable(status)) {
    return false;
  }

  return isSpeakerTrackAvailable(status);
}

function getSupportedSpeakerTrackBehaviors(productPlatform) {
  if (!productPlatform) {
    return null;
  }

  const behaviorSet = SPEAKER_TRACK_BEHAVIORS_BY_PRODUCT.find(({ products }) =>
    products.some((product) => productPlatformMatches(productPlatform, product))
  );

  return behaviorSet?.behaviors || null;
}

function productPlatformMatches(actualProduct, expectedProduct) {
  const actual = normalizeProductPlatformKey(actualProduct);
  const expected = normalizeProductPlatformKey(expectedProduct);

  return Boolean(actual && expected && (actual === expected || actual.endsWith(expected)));
}

function normalizeProductPlatformKey(value) {
  return String(value || "")
    .trim()
    .replace(/^cisco\s+/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function isFramesUnavailable(status) {
  const availability = normalizeStatusToken(
    getPath(status, "SpeakerTrack.Frames.Availability") ||
      getPath(status, "speakerTrack.frames.availability")
  );

  return availability === "unavailable";
}

function hasSpeakerTrackStatus(status) {
  return Boolean(status?.SpeakerTrack || status?.speakerTrack);
}

function isSpeakerTrackAvailable(status) {
  const speakerTrack = status?.SpeakerTrack || status?.speakerTrack;
  const availability = normalizeStatusToken(speakerTrack?.Availability || speakerTrack?.availability);

  if (!speakerTrack) {
    return false;
  }

  return !availability || !["off", "unavailable"].includes(availability);
}

function getActiveCameraBehavior(status) {
  return (
    stringifyStatusValue(getPath(status, "SpeakerTrack.Behavior.Active")) ||
    stringifyStatusValue(getPath(status, "speakerTrack.behavior.active")) ||
    stringifyStatusValue(getPath(status, "SpeakerTrack.State")) ||
    stringifyStatusValue(getPath(status, "speakerTrack.state"))
  );
}

function normalizeStatusToken(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isCameraPresetListResponse(message, pendingRequest) {
  return Boolean(
    normalizeXapiMethod(pendingRequest?.method).endsWith("camera/preset/list") &&
      message?.result
  );
}

function normalizePresetValue(presetValue) {
  const presets = Array.isArray(presetValue) ? presetValue : presetValue ? [presetValue] : [];

  return presets
    .map((preset, index) => ({
      id: stringifyStatusValue(preset.id || preset.PresetId || index + 1),
      presetId: stringifyStatusValue(preset.PresetId || preset.id || index + 1),
      cameraId: stringifyStatusValue(preset.CameraId),
      name: stringifyStatusValue(preset.Name) || `Preset ${preset.PresetId || preset.id || index + 1}`,
      defaultPosition: stringifyStatusValue(preset.DefaultPosition),
      raw: preset,
    }))
    .filter((preset) => preset.presetId);
}

function mergeStatusObjects(current, incoming) {
  if (!current || typeof current !== "object") {
    return incoming;
  }

  if (!incoming || typeof incoming !== "object") {
    return current;
  }

  if (Array.isArray(current) || Array.isArray(incoming)) {
    return incoming;
  }

  return Object.entries(incoming).reduce(
    (merged, [key, value]) => ({
      ...merged,
      [key]: mergeStatusObjects(merged[key], value),
    }),
    { ...current }
  );
}

function createCameraEntry(camera, fallbackId) {
  if (!camera || typeof camera !== "object") {
    return null;
  }

  return {
    id: findCameraId(camera) || String(fallbackId),
    raw: camera,
  };
}

function normalizeCameraEntry(entry) {
  const camera = entry.raw;

  return {
    id: entry.id,
    connected: stringifyStatusValue(
      findFirstDefined(camera, ["Connected", "connected", "Status", "status"])
    ),
    manufacturer: stringifyStatusValue(
      findFirstDefined(camera, ["Manufacturer", "manufacturer", "Vendor", "vendor"])
    ),
    model: stringifyStatusValue(findFirstDefined(camera, ["Model", "model", "Name", "name"])),
    serial: stringifyStatusValue(
      findFirstDefined(camera, ["SerialNumber", "Serial", "serialNumber", "serial"])
    ),
    hardwareId: stringifyStatusValue(
      findFirstDefined(camera, ["HardwareId", "HardwareID", "hardwareId", "hardwareID"])
    ),
    raw: camera,
  };
}

function looksLikeSingleCamera(value) {
  return [
    "Connected",
    "connected",
    "HardwareId",
    "HardwareID",
    "Manufacturer",
    "manufacturer",
    "Model",
    "model",
    "SerialNumber",
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function findCameraId(camera) {
  return stringifyStatusValue(findFirstDefined(camera, ["id", "Id", "_id", "CameraId", "CameraID"]));
}

function findFirstDefined(value, paths) {
  for (const path of paths) {
    const result = getPath(value, path);

    if (result !== undefined && result !== null && result !== "") {
      return result;
    }
  }

  return undefined;
}

function stringifyStatusValue(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  return String(value);
}

function formatCameraList(cameras = []) {
  if (!cameras.length) {
    return "no cameras reported";
  }

  return cameras
    .map((camera) => {
      const name = [camera.manufacturer, camera.model].filter(Boolean).join(" ");
      const label = name || `Camera ${camera.id || "unknown"}`;
      const status = camera.connected ? ` (${camera.connected})` : "";

      return `${label}${status}`;
    })
    .join(", ");
}

function formatPresetList(presets = []) {
  if (!presets.length) {
    return "no saved presets";
  }

  return presets.map((preset) => preset.name).join(", ");
}

function getCameraListSignature(cameras = []) {
  return cameras
    .map((camera) =>
      [
        camera.id,
        camera.connected,
        camera.manufacturer,
        camera.model,
        camera.serial,
        camera.hardwareId,
      ].join("\u001f")
    )
    .join("\u001e");
}

function getCameraModeListSignature(modes = []) {
  return modes
    .map((mode) =>
      [mode.id, mode.label, mode.method, JSON.stringify(mode.params), mode.active].join("\u001f")
    )
    .join("\u001e");
}

function getPresetListSignature(presets = []) {
  return presets
    .map((preset) =>
      [preset.id, preset.presetId, preset.cameraId, preset.name, preset.defaultPosition].join(
        "\u001f"
      )
    )
    .join("\u001e");
}

function normalizeXapiMethod(method) {
  return String(method || "")
    .trim()
    .replace(/^x(command|status|configuration|feedback)\s+/i, "x$1/")
    .replace(/\s+/g, "/")
    .replace(/\/+/g, "/")
    .toLowerCase();
}

function formatXapiError(error) {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  return [error.code, error.message || error.data].filter(Boolean).join(" ");
}

async function pairWithCurrentToken() {
  if (!app.usbcToken) {
    return;
  }

  if (!app.webexReady || !app.webexRegistered) {
    setState({ pairing: "pending" });
    addLog("USB-C token is ready; waiting for Webex registration before pairing.");
    return;
  }

  if (app.pairingInFlight) {
    return app.pairingInFlight;
  }

  if (isPairedDataChannelReady()) {
    return refreshUsbcProximity(app.usbcToken);
  }

  app.pairingInFlight = pairWithUsbcToken(app.usbcToken).finally(() => {
    app.pairingInFlight = null;
    render();
  });

  return app.pairingInFlight;
}

function isPairedDataChannelReady() {
  const llm = app.webex?.internal?.llm;

  return Boolean(
    app.state.pairing === "connected" &&
      app.state.dataChannel === "connected" &&
      app.datachannelUrl &&
      resolveTargetDeviceIdentity() &&
      llm?.socket &&
      llm.isConnected?.()
  );
}

async function refreshUsbcProximity(token) {
  if (app.proximityRefreshInFlight) {
    return app.proximityRefreshInFlight;
  }

  app.proximityRefreshInFlight = lookupUsbcAdvertisement(token)
    .then((endpoint) => {
      app.advertisedEndpoint = endpoint;
      addLog("Webex proximity advertisement refreshed for existing pairing.");
      return endpoint;
    })
    .catch((error) => {
      addLog(
        `Webex proximity refresh failed; keeping current pairing: ${formatError(error)}`,
        "error"
      );
      return null;
    })
    .finally(() => {
      app.proximityRefreshInFlight = null;
    });

  return app.proximityRefreshInFlight;
}

async function pairWithUsbcToken(token) {
  setState({ pairing: "pending", dataChannel: "pending" });

  try {
    const endpoint = await lookupUsbcAdvertisement(token);

    app.advertisedEndpoint = endpoint;
    addLog("Webex proximity advertisement lookup succeeded.");

    const { proof, joinUrl, spaceUrl } = getEndpointDetails(endpoint);

    if (!proof || !joinUrl || !spaceUrl) {
      throw new Error("Proximity lookup did not include proof, join URL, and Lyra space URL.");
    }

    const joinResponse = await joinLyraSpace({ proof, joinUrl, spaceUrl });
    const spaceId = getLastUrlSegment(spaceUrl);
    const space = await fetchLyraSpace(spaceId, spaceUrl, joinResponse);

    app.lyraSpace = space;
    setState({ pairing: "connected" });
    addLog(`Joined Lyra space ${spaceId}.`);

    await upsertPairedDevice(space);

    const datachannelUrl = resolveDatachannelUrl(space, endpoint, joinResponse);

    if (!datachannelUrl) {
      setState({ dataChannel: "blocked" });
      addLog("Pairing completed, but no datachannel URL was found in the Lyra response.", "error");
      return;
    }

    app.datachannelUrl = datachannelUrl;
    await connectLlmDataChannel(spaceUrl, datachannelUrl);
  } catch (error) {
    setState({ pairing: "error", dataChannel: "error" });
    addLog(`Webex USB-C pairing failed: ${formatError(error)}`, "error");
  }
}

async function lookupUsbcAdvertisement(token) {
  const response = await app.webex.request({
    method: "POST",
    api: "proximity",
    resource: "usb-c/advertisements/lookup",
    body: { token },
  });

  return getResponseBody(response);
}

async function joinLyraSpace({ proof, joinUrl, spaceUrl }) {
  const lyraSpace = {
    id: getLastUrlSegment(spaceUrl),
    url: `/spaces/${getLastUrlSegment(spaceUrl)}`,
  };

  if (app.webex?.internal?.lyra?.space?.join) {
    return app.webex.internal.lyra.space.join(lyraSpace, {
      passType: "PROOF",
      data: proof,
      uri: joinUrl,
    });
  }

  return app.webex.request({
    method: "PUT",
    uri: joinUrl,
    body: {
      pass: {
        type: "PROOF",
        data: proof,
      },
      deviceUrl: app.webex.internal.device.url,
    },
  });
}

async function fetchLyraSpace(spaceId, spaceUrl, joinResponse) {
  const joinedSpace = getResponseBody(joinResponse);

  if (app.webex?.internal?.lyra?.space?.get) {
    try {
      return await app.webex.internal.lyra.space.get({ id: spaceId });
    } catch (error) {
      addLog(`Lyra space lookup through SDK failed, trying direct URL: ${formatError(error)}`);
    }
  }

  try {
    const response = await app.webex.request({
      method: "GET",
      uri: spaceUrl,
    });

    return getResponseBody(response);
  } catch (error) {
    if (joinedSpace?.identity || joinedSpace?.id || joinedSpace?.url) {
      addLog(`Direct Lyra lookup failed, using join response body: ${formatError(error)}`);
      return joinedSpace;
    }

    throw error;
  }
}

async function upsertPairedDevice(space) {
  const deviceManager = app.webex?.devicemanager;

  if (!deviceManager?.upsert) {
    app.pairedDevice = space;
    return;
  }

  try {
    deviceManager._devicePendingPinChallenge = space;
    const device = await deviceManager.upsert(space);

    app.pairedDevice = device;
    addLog(`Device manager paired device cache updated for ${getDeviceDisplayName(device)}.`);
  } catch (error) {
    app.pairedDevice = space;
    addLog(`Device manager upsert failed, continuing with datachannel setup: ${formatError(error)}`);
  }
}

async function connectLlmDataChannel(spaceUrl, datachannelUrl) {
  const llm = app.webex?.internal?.llm;

  if (!llm?.registerAndConnect) {
    setState({ dataChannel: "unavailable" });
    addLog("The Webex SDK LLM plugin is unavailable in this build.", "error");
    return;
  }

  if (!app.webex.internal.device?.url) {
    await app.webex.internal.device.register();
  }

  if (
    llm.isConnected?.() &&
    llm.getLocusUrl?.() === spaceUrl &&
    llm.getDatachannelUrl?.() === datachannelUrl
  ) {
    setState({ dataChannel: "connected" });
    addLog("LLM datachannel is already connected for this paired device.");
    await requestCameraDataOverDataChannel();
    return;
  }

  if (llm.isConnected?.()) {
    await llm.disconnectLLM?.();
  }

  llm.off?.("event:relay.event", handleLlmRelayEvent);
  llm.on("event:relay.event", handleLlmRelayEvent);
  llm.off?.("online", handleLlmOnline);
  llm.on("online", handleLlmOnline);
  llm.off?.("offline", handleLlmOffline);
  llm.on("offline", handleLlmOffline);

  setState({ dataChannel: "pending" });
  addLog("Registering and connecting to the paired device datachannel.");

  await llm.registerAndConnect(spaceUrl, datachannelUrl);
  await waitForLlmOnline(llm);

  setState({ dataChannel: "connected" });
  addLog("LLM datachannel is connected and listening for relay events.");

  await requestCameraDataOverDataChannel();
}

function waitForLlmOnline(llm) {
  if (llm.isConnected?.()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the LLM datachannel to come online."));
    }, CONFIG.llmOnlineTimeoutMs);

    const cleanup = () => {
      window.clearTimeout(timer);
      llm.off?.("online", onOnline);
      llm.off?.("offline.permanent", onOfflinePermanent);
    };

    const onOnline = () => {
      cleanup();
      resolve();
    };

    const onOfflinePermanent = (event) => {
      cleanup();
      reject(new Error(`LLM datachannel closed permanently: ${event?.reason || "unknown"}`));
    };

    llm.on("online", onOnline);
    llm.on("offline.permanent", onOfflinePermanent);
  });
}

function handleLlmOnline() {
  setState({ dataChannel: "connected" });
}

function handleLlmOffline(event) {
  setState({ dataChannel: "disconnected" });
  addLog(`LLM datachannel went offline: ${event?.reason || "unknown reason"}`, "error");
}

function handleLlmRelayEvent(event) {
  addLog("Received relay event from the LLM datachannel.");
  handleRelayPayload(event, "llm");
}

function handleLyraSpaceUpdated({ data }) {
  if (!data?.spaceUrl) {
    return;
  }

  addLog(`Lyra space update received for ${data.spaceUrl}.`);
}

function getEndpointDetails(endpoint = {}) {
  const links = endpoint.links || {};

  return {
    proof: endpoint.proof,
    joinUrl: links.addMeToSpace?.href || endpoint.addMeToSpace?.href,
    spaceUrl: links.lyra_space?.href || links.lyraSpace?.href || endpoint.spaceUrl,
  };
}

function resolveDatachannelUrl(...candidates) {
  for (const candidate of candidates) {
    const url = findFirstUrl(candidate, [
      "datachannel",
      "datachannelUrl",
      "dataChannelUrl",
      "llmSocketUrl",
    ]);

    if (url) {
      return url;
    }
  }

  return null;
}

function findFirstUrl(value, keys, depth = 0) {
  if (!value || typeof value !== "object" || depth > 10) {
    return null;
  }

  for (const key of keys) {
    const direct = value[key];

    if (typeof direct === "string") {
      return direct;
    }

    if (typeof direct?.href === "string") {
      return direct.href;
    }
  }

  for (const child of Object.values(value)) {
    const result = findFirstUrl(child, keys, depth + 1);

    if (result) {
      return result;
    }
  }

  return null;
}

function findNestedValue(value, key, depth = 0) {
  if (!value || depth > 10) {
    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(value, key)) {
    return value[key];
  }

  for (const child of Object.values(value)) {
    const result = findNestedValue(child, key, depth + 1);

    if (result) {
      return result;
    }
  }

  return null;
}

function getRelayData(payload = {}) {
  return payload.data || payload.request || payload;
}

function findFirstString(value, paths) {
  for (const path of paths) {
    const result = getPath(value, path);

    if (typeof result === "string" && result.trim()) {
      return result;
    }
  }

  return null;
}

function getPath(value, path) {
  return String(path)
    .split(".")
    .reduce((current, part) => {
      if (!current || typeof current !== "object") {
        return undefined;
      }

      return current[part];
    }, value);
}

function normalizeDeviceIdentity(value) {
  const identity = String(value || "").trim();

  if (!identity) {
    return null;
  }

  return identity.includes("/") ? getLastUrlSegment(identity) || identity : identity;
}

function createUuid() {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);

  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return [...bytes]
    .map((byte, index) => {
      const hex = byte.toString(16).padStart(2, "0");

      return [4, 6, 8, 10].includes(index) ? `-${hex}` : hex;
    })
    .join("");
}

function findCiscoHidDevice(devices = [], options = {}) {
  const ciscoDevices = devices.filter(isCiscoHidDevice);
  const relayDevice = ciscoDevices.find(findHidRelayCollection);

  if (relayDevice || options.requireRelay) {
    return relayDevice;
  }

  return ciscoDevices[0];
}

function isCiscoHidDevice(device) {
  return CONFIG.hidFilters.some((filter) => {
    const vendorMatches = device.vendorId === filter.vendorId;
    const productMatches = !filter.productId || device.productId === filter.productId;

    return vendorMatches && productMatches;
  });
}

function resetHidRelayState() {
  app.hidRelayCollection = null;
  app.hidOutputReportId = CONFIG.hidOutputReportId;
  app.hidOutputReportByteLength = CONFIG.hidReportByteLength;
  app.hidInputReportIds = new Set();
}

function configureHidRelay(device) {
  const relayCollection = findHidRelayCollection(device);

  if (!relayCollection) {
    throw new Error(
      `Cisco HID relay collection ${formatHidUsage(
        CONFIG.hidRelayUsagePage
      )}/${formatHidUsage(
        CONFIG.hidRelayUsage
      )} was not found. The FE00 interface is the touch/auxiliary HID device and cannot write the token request.`
    );
  }

  const outputReport = selectHidOutputReport(relayCollection);

  if (!outputReport) {
    throw new Error("Cisco HID relay collection has no output report.");
  }

  app.hidRelayCollection = relayCollection;
  app.hidOutputReportId = Number(outputReport.reportId ?? CONFIG.hidOutputReportId);
  app.hidOutputReportByteLength = getHidReportByteLength(outputReport);
  app.hidInputReportIds = new Set(
    getHidReportIds(getHidReports(relayCollection, "inputReports"))
  );
  app.hidBuffers.clear();

  addLog(
    `Using HID relay collection ${formatHidUsage(relayCollection.usagePage)}/${formatHidUsage(
      relayCollection.usage
    )}, output report ${formatHidReportId(
      app.hidOutputReportId
    )}, ${app.hidOutputReportByteLength} byte reports.`
  );

  if (app.hidInputReportIds.size) {
    addLog(
      `Listening for HID relay input report(s): ${[...app.hidInputReportIds]
        .map(formatHidReportId)
        .join(", ")}.`
    );
  }
}

function findHidRelayCollection(device) {
  return getHidCollections(device).find(
    (collection) =>
      collection.usagePage === CONFIG.hidRelayUsagePage &&
      collection.usage === CONFIG.hidRelayUsage
  );
}

function getHidCollections(device) {
  const collections = [];
  const visit = (collection) => {
    if (!collection) {
      return;
    }

    collections.push(collection);
    collection.children?.forEach(visit);
  };

  device?.collections?.forEach(visit);
  return collections;
}

function selectHidOutputReport(collection) {
  const reports = getHidReports(collection, "outputReports");
  const relaySizedReports = reports.filter((report) => getHidReportByteLength(report) >= 4);
  const candidates = relaySizedReports.length ? relaySizedReports : reports;

  return (
    candidates.find((report) => Number(report.reportId) === CONFIG.hidOutputReportId) ||
    [...candidates].sort(
      (left, right) => getHidReportByteLength(right) - getHidReportByteLength(left)
    )[0] ||
    null
  );
}

function getHidReports(collection, reportType) {
  const reports = [];
  const visit = (currentCollection) => {
    if (!currentCollection) {
      return;
    }

    reports.push(...(currentCollection[reportType] || []));
    currentCollection.children?.forEach(visit);
  };

  visit(collection);
  return reports;
}

function getHidReportByteLength(report) {
  const bitLength = (report?.items || []).reduce((total, item) => {
    const reportSize = Number(item.reportSize) || 0;
    const reportCount = Number(item.reportCount) || 0;

    return total + reportSize * reportCount;
  }, 0);

  return bitLength > 0 ? Math.ceil(bitLength / 8) : CONFIG.hidReportByteLength;
}

function getHidReportIds(reports = []) {
  return reports
    .map((report) => Number(report.reportId))
    .filter((reportId) => Number.isFinite(Number(reportId)));
}

function isRelayInputReport(reportId) {
  return !app.hidInputReportIds.size || app.hidInputReportIds.has(Number(reportId));
}

function jsonToHidPackets(payload, packetByteLength = app.hidOutputReportByteLength) {
  const encodedData = new TextEncoder().encode(JSON.stringify(payload));
  const headerSize = 3;
  const maxPacketSize = Math.max(headerSize + 1, packetByteLength);
  const chunkSize = maxPacketSize - headerSize;
  const packets = [];
  let offset = 0;

  while (offset < encodedData.length) {
    const remainingTotal = encodedData.length - offset;
    const currentChunkSize = Math.min(remainingTotal, chunkSize);
    const packet = new Uint8Array(maxPacketSize);
    const view = new DataView(packet.buffer);
    const bytes = packet.subarray(headerSize);

    view.setUint8(0, currentChunkSize);
    view.setUint16(1, Math.max(0, remainingTotal - currentChunkSize), false);
    bytes.set(encodedData.slice(offset, offset + currentChunkSize));
    packets.push(packet);
    offset += currentChunkSize;
  }

  return packets;
}

function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((length, chunk) => length + chunk.length, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });

  return bytes;
}

function logHidCollections(device) {
  getHidCollections(device).forEach((collection) => {
    const inputReports = (collection.inputReports || []).map(formatHidReportSummary);
    const outputReports = (collection.outputReports || []).map(formatHidReportSummary);
    const featureReports = (collection.featureReports || []).map(formatHidReportSummary);
    const reportDetails = [
      inputReports.length ? `input ${inputReports.join(", ")}` : "",
      outputReports.length ? `output ${outputReports.join(", ")}` : "",
      featureReports.length ? `feature ${featureReports.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    addLog(
      `HID collection usage ${formatHidUsage(collection.usage)}, usage page ${formatHidUsage(
        collection.usagePage
      )}${reportDetails ? ` (${reportDetails})` : ""}.`
    );
  });
}

function setState(nextState) {
  app.state = {
    ...app.state,
    ...nextState,
  };
  render();
}

function render() {
  if (!app.dom.alert) {
    return;
  }

  renderStateBadge(app.dom.webexState, app.state.webex);
  renderStateBadge(app.dom.usbState, app.state.usb);
  renderStateBadge(app.dom.permissionState, app.state.permission);
  renderStateBadge(app.dom.tokenState, app.state.token);
  renderStateBadge(app.dom.pairingState, app.state.pairing);
  renderStateBadge(app.dom.dataChannelState, app.state.dataChannel);
  renderActiveStep();
  renderDeviceInfo();
  renderGuidance();
  renderCameraInventory();
  renderCameraModeControls();
  renderPresetControls();
  renderManualCameraControls();
  renderButtons();
  renderLog();
}

function renderStateBadge(element, state) {
  element.textContent = STEP_LABELS[state] || state;
  element.className = `state-badge state-${state}`;
}

function renderActiveStep() {
  const activeStep = getActiveStep();

  app.dom.stepPanels.forEach((panel) => {
    panel.hidden = panel.dataset.step !== activeStep;
  });
}

function getActiveStep() {
  const signedIn = Boolean(app.oauthCredentials);

  if (!signedIn || app.state.webex === "needed") {
    return "signin";
  }

  if (!app.webexRegistered) {
    return "webexLoading";
  }

  if (!("hid" in navigator) || (!app.hidDevice && !app.usbConnectionConfirmed)) {
    return "usbConnect";
  }

  if (!app.hidDevice || !app.hidOpened || app.state.permission !== "granted") {
    return "usbPermission";
  }

  if (app.state.dataChannel !== "connected" || !resolveTargetDeviceIdentity()) {
    return "pairing";
  }

  return "control";
}

function renderDeviceInfo() {
  const deviceName = app.hidDevice?.productName || "Cisco collaboration device";
  const deviceDetail = app.hidDevice
    ? describeHidDevice(app.hidDevice)
    : "Connect the device with USB-C, then grant browser access.";

  if (!app.hidDevice) {
    app.dom.deviceName.textContent = "No Cisco USB HID device selected";
    app.dom.deviceDetail.textContent = deviceDetail;
    if (app.dom.pairingDeviceName) {
      app.dom.pairingDeviceName.textContent = "No Cisco USB HID device selected";
    }
    if (app.dom.pairingDeviceDetail) {
      app.dom.pairingDeviceDetail.textContent = deviceDetail;
    }
    return;
  }

  app.dom.deviceName.textContent = deviceName;
  app.dom.deviceDetail.textContent = deviceDetail;

  if (app.dom.pairingDeviceName) {
    app.dom.pairingDeviceName.textContent = deviceName;
  }

  if (app.dom.pairingDeviceDetail) {
    app.dom.pairingDeviceDetail.textContent = deviceDetail;
  }
}

function renderGuidance() {
  const activeStep = getActiveStep();
  let message = "Connect a Cisco collaboration device over USB-C to begin pairing.";
  let variant = "info";
  let steps = [
    "Connect the Cisco collaboration device to this computer with USB-C.",
    "Grant USB HID access when the browser prompts for the device.",
    "Keep this page open while the USB-C token is requested and Webex pairing completes.",
  ];

  if (activeStep === "signin") {
    message = isHostedWebApp()
      ? "Sign in with Webex to register this browser and complete USB-C pairing."
      : "Serve this app from http://localhost or https:// to use Webex sign-in.";
    variant = isHostedWebApp() ? "info" : "warning";
    steps = [
      "Serve this page from the redirect URI configured in your Webex integration.",
      "Sign in with Webex.",
      "Return to this page after the OAuth redirect completes.",
    ];
  }

  if (activeStep === "webexLoading") {
    message = "Webex sign-in is ready. Loading the SDK and registering this browser.";
    variant = "info";
  }

  if (activeStep === "usbConnect") {
    message = "Connect this computer to the Cisco collaboration device with USB-C.";
    variant = "info";
  }

  if (activeStep === "usbPermission") {
    message = "Grant browser access to the Cisco USB HID device.";
    variant = "warning";
    steps = [
      "Click Grant USB HID Access.",
      "Choose the Cisco collaboration device in the browser prompt.",
      "Keep the cable connected while the token is requested.",
    ];
  }

  if (activeStep === "pairing") {
    message = app.pairingInFlight
      ? "Pairing is in progress. Keep this page open."
      : "Requesting the pairing token from the connected device.";
    variant = "info";
  }

  if (app.state.usb === "connected" && app.state.permission === "granted") {
    message = "Cisco USB HID access is ready. The app will request the USB-C token automatically.";
    variant = "success";
  }

  if (app.state.usb === "disconnected" && app.state.permission === "needed") {
    message =
      "No Cisco device is available to this page yet. Plug the device in, then grant USB HID access.";
    variant = "warning";
  }

  if (app.state.permission === "needed" && app.state.usb !== "disconnected") {
    message =
      "The device may be connected, but this browser origin still needs USB HID permission.";
    variant = "warning";
  }

  if (app.state.dataChannel === "connected") {
    const hasTargetIdentity = Boolean(resolveTargetDeviceIdentity());

    message = hasTargetIdentity
      ? "Pairing is complete. Camera controls now send XAPI requests over the datachannel."
      : "Pairing is complete, but no paired device identity was found for XAPI datachannel control.";
    variant = hasTargetIdentity ? "success" : "warning";
  }

  if (
    ["error", "blocked", "unavailable"].includes(app.state.usb) ||
    ["error", "blocked", "unavailable"].includes(app.state.webex) ||
    app.state.pairing === "error"
  ) {
    message = "Pairing needs attention. Check the status rows and event log below.";
    variant = "error";
  }

  app.dom.alert.textContent = message;
  app.dom.alert.className = `alert alert-${variant}`;
  app.dom.connectGuide?.replaceChildren(
    ...steps.map((step) => {
      const listItem = document.createElement("li");

      listItem.textContent = step;
      return listItem;
    })
  );
}

function renderButtons() {
  const activeStep = getActiveStep();
  const hidSupported = "hid" in navigator;
  const hidReady = Boolean(app.hidDevice && app.hidOpened);
  const signedIn = Boolean(app.oauthCredentials);
  const canControlCamera = Boolean(
    app.state.dataChannel === "connected" && resolveTargetDeviceIdentity()
  );

  if (app.dom.signInBtn) {
    app.dom.signInBtn.disabled = signedIn || !isHostedWebApp();
    app.dom.signInBtn.hidden = signedIn;
  }

  if (app.dom.signOutBtn) {
    app.dom.signOutBtn.hidden = !signedIn;
  }

  if (app.dom.confirmUsbBtn) {
    app.dom.confirmUsbBtn.disabled = activeStep !== "usbConnect" || !hidSupported;
  }

  app.dom.grantHidBtn.disabled = !hidSupported || app.state.permission === "pending";
  if (app.dom.refreshCamerasBtn) {
    app.dom.refreshCamerasBtn.disabled = !canControlCamera;
  }

  app.dom.grantHidBtn.textContent = hidReady ? "Change USB Device" : "Grant USB HID Access";

  app.dom.cameraModeControls
    ?.querySelectorAll("button")
    .forEach((button) => {
      button.disabled = !canControlCamera;
    });
  app.dom.presetControls
    ?.querySelectorAll("button")
    .forEach((button) => {
      button.disabled = !canControlCamera || button.dataset.available !== "true";
    });
  app.dom.manualCameraControls
    ?.querySelectorAll("button")
    .forEach((button) => {
      button.disabled = !canControlCamera;
    });
}

function renderCameraInventory() {
  if (!app.dom.cameraInventory) {
    return;
  }

  const cameras = app.availableCameras;

  if (!cameras.length) {
    reconcileChildren(
      app.dom.cameraInventory,
      [{ message: "No camera status received yet." }],
      () => "empty",
      createCameraEmptyItem,
      updateCameraEmptyItem
    );
    return;
  }

  reconcileChildren(
    app.dom.cameraInventory,
    cameras,
    (camera, index) => `camera:${camera.id || index + 1}`,
    createCameraInventoryItem,
    updateCameraInventoryItem
  );
}

function renderCameraModeControls() {
  if (!app.dom.cameraModeControls) {
    return;
  }

  const modes = app.cameraModes;

  if (!modes.length) {
    reconcileChildren(
      app.dom.cameraModeControls,
      [{ message: "No camera modes received yet." }],
      () => "empty",
      createControlEmptyItem,
      updateControlEmptyItem
    );
    return;
  }

  reconcileChildren(
    app.dom.cameraModeControls,
    modes,
    (mode) => `mode:${mode.id}`,
    createCameraModeButton,
    updateCameraModeButton
  );
}

function renderPresetControls() {
  if (!app.dom.presetControls) {
    return;
  }

  reconcileChildren(
    app.dom.presetControls,
    getPresetSlotItems(),
    (preset) => `preset:${preset.slot}`,
    createPresetButton,
    updatePresetButton
  );
}

function renderManualCameraControls() {
  if (!app.dom.manualCameraControls) {
    return;
  }

  const visible = isManualCameraModeActive();

  app.dom.manualCameraControls.hidden = !visible;

  if (!visible) {
    app.savePresetPickerOpen = false;
  }

  if (app.dom.savePresetControls) {
    app.dom.savePresetControls.hidden = !app.savePresetPickerOpen || !visible;
    renderSavePresetControls();
  }
}

function renderSavePresetControls() {
  if (!app.dom.savePresetControls) {
    return;
  }

  reconcileChildren(
    app.dom.savePresetControls,
    getPresetSlotItems(),
    (preset) => `save-preset:${preset.slot}`,
    createSavePresetButton,
    updateSavePresetButton
  );
}

function isManualCameraModeActive() {
  return app.cameraModes.some((mode) => mode.id === "Manual" && mode.active);
}

function toggleSavePresetPicker() {
  app.savePresetPickerOpen = !app.savePresetPickerOpen;
  render();
}

function getPresetSlotItems() {
  const presetsBySlot = new Map(
    app.cameraPresets.map((preset) => [Number(preset.presetId), preset])
  );

  return PRESET_SLOTS.map((slot) => ({
    ...(presetsBySlot.get(slot) || {}),
    slot,
    presetId: String(slot),
    available: presetsBySlot.has(slot),
  }));
}

function reconcileChildren(container, items, getKey, createElement, updateElement) {
  const existingByKey = new Map(
    [...container.children]
      .filter((element) => element.dataset.renderKey)
      .map((element) => [element.dataset.renderKey, element])
  );
  const nextElements = items.map((item, index) => {
    const key = String(getKey(item, index));
    const element = existingByKey.get(key) || createElement(item, index);

    element.dataset.renderKey = key;
    updateElement(element, item, index);
    return element;
  });
  const nextElementSet = new Set(nextElements);

  [...container.children].forEach((element) => {
    if (!nextElementSet.has(element)) {
      element.remove();
    }
  });

  nextElements.forEach((element, index) => {
    const currentElement = container.children[index];

    if (currentElement !== element) {
      container.insertBefore(element, currentElement || null);
    }
  });
}

function createCameraEmptyItem() {
  const listItem = document.createElement("li");

  listItem.className = "camera-empty";
  return listItem;
}

function updateCameraEmptyItem(listItem, item) {
  setTextIfChanged(listItem, item.message);
  setClassNameIfChanged(listItem, "camera-empty");
}

function createCameraInventoryItem() {
  const listItem = document.createElement("li");
  const name = document.createElement("span");
  const detail = document.createElement("small");

  name.dataset.role = "camera-name";
  detail.dataset.role = "camera-detail";
  listItem.replaceChildren(name, detail);
  return listItem;
}

function updateCameraInventoryItem(listItem, camera, index) {
  const name = getOrCreateRoleElement(listItem, "camera-name", "span");
  const detail = getOrCreateRoleElement(listItem, "camera-detail", "small");
  const label = [camera.manufacturer, camera.model].filter(Boolean).join(" ");
  const detailParts = [
    `ID ${camera.id || index + 1}`,
    camera.connected ? `Connected ${camera.connected}` : "",
    camera.hardwareId ? `Hardware ${camera.hardwareId}` : "",
    camera.serial ? `Serial ${camera.serial}` : "",
  ].filter(Boolean);

  setClassNameIfChanged(listItem, "camera-item");
  setTextIfChanged(name, label || `Camera ${camera.id || index + 1}`);
  setTextIfChanged(detail, detailParts.join(" - "));
}

function createControlEmptyItem(item) {
  return createEmptyControl(item.message);
}

function updateControlEmptyItem(empty, item) {
  setTextIfChanged(empty, item.message);
  setClassNameIfChanged(empty, "control-empty");
}

function createCameraModeButton() {
  const button = document.createElement("button");

  button.type = "button";
  button.addEventListener("click", () => {
    const mode = button.cameraMode;

    if (!mode) {
      return;
    }

    sendXapiOverDataChannel(mode.method, mode.params, {
      successMessage: `Requested camera mode: ${mode.label}.`,
    });
  });
  return button;
}

function updateCameraModeButton(button, mode) {
  button.cameraMode = mode;
  button.type = "button";
  setTextIfChanged(button, mode.label);
  setClassNameIfChanged(
    button,
    mode.active ? "control-button control-button-active" : "control-button"
  );
}

function createPresetButton() {
  const button = document.createElement("button");

  button.type = "button";
  button.addEventListener("click", () => {
    const preset = button.cameraPreset;

    if (!preset?.available) {
      return;
    }

    sendXapiOverDataChannel(
      "xCommand/Camera/Preset/Activate",
      {
        PresetId: Number(preset.presetId),
      },
      {
        successMessage: `Requested camera preset: ${preset.name}.`,
      }
    );
  });
  return button;
}

function createSavePresetButton() {
  const button = document.createElement("button");

  button.type = "button";
  button.addEventListener("click", () => {
    const preset = button.cameraPreset;

    if (!preset) {
      return;
    }

    saveCameraPreset(preset.slot);
  });
  return button;
}

function updatePresetButton(button, preset) {
  const title = preset.available ? `Preset ${preset.slot}` : `Preset ${preset.slot} is not saved`;

  button.cameraPreset = preset;
  button.type = "button";
  button.dataset.available = preset.available ? "true" : "false";
  setTextIfChanged(button, `Preset ${preset.slot}`);
  setClassNameIfChanged(
    button,
    !preset.available
      ? "control-button control-button-unavailable"
      : normalizeStatusToken(preset.defaultPosition) === "true"
        ? "control-button control-button-secondary"
        : "control-button"
  );

  if (button.title !== title) {
    button.title = title;
  }
}

function updateSavePresetButton(button, preset) {
  const title = preset.available ? `Update preset ${preset.slot}` : `Save preset ${preset.slot}`;

  button.cameraPreset = preset;
  button.type = "button";
  button.dataset.available = preset.available ? "true" : "false";
  setTextIfChanged(button, String(preset.slot));
  setClassNameIfChanged(
    button,
    preset.available ? "save-preset-button save-preset-existing" : "save-preset-button"
  );

  if (button.title !== title) {
    button.title = title;
  }
}

function bindCameraRampButton(button) {
  let ramping = false;

  const start = (event) => {
    event.preventDefault();

    if (button.disabled || ramping) {
      return;
    }

    ramping = true;
    button.setPointerCapture?.(event.pointerId);
    startCameraRamp(button.dataset.rampAxis, button.dataset.rampDirection);
  };
  const stop = (event) => {
    if (!ramping) {
      return;
    }

    event?.preventDefault?.();
    ramping = false;
    stopCameraRamp(button.dataset.rampAxis);
  };

  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("lostpointercapture", stop);
  button.addEventListener("click", (event) => event.preventDefault());
  button.addEventListener("keydown", (event) => {
    if (![" ", "Enter"].includes(event.key) || button.disabled || ramping) {
      return;
    }

    event.preventDefault();
    ramping = true;
    startCameraRamp(button.dataset.rampAxis, button.dataset.rampDirection);
  });
  button.addEventListener("keyup", (event) => {
    if (![" ", "Enter"].includes(event.key)) {
      return;
    }

    stop(event);
  });
  button.addEventListener("blur", stop);
}

function startCameraRamp(axis, direction) {
  sendCameraRamp(axis, direction);
}

function stopCameraRamp(axis) {
  sendCameraRamp(axis, "Stop");
}

function sendCameraRamp(axis, direction) {
  if (!["Pan", "Tilt", "Zoom"].includes(axis) || !direction) {
    return false;
  }

  const params = {
    CameraId: getPrimaryCameraId(),
    [axis]: getCameraRampCommandDirection(axis, direction),
  };

  if (direction !== "Stop") {
    params[`${axis}Speed`] = CAMERA_RAMP_SPEED;
  }

  return sendXapiOverDataChannel("xCommand/Camera/Ramp", params, {
    successMessage: null,
  });
}

function getCameraRampCommandDirection(axis, direction) {
  const flippedDirections = {
    Pan: {
      Left: "Right",
      Right: "Left",
    },
    Tilt: {
      Up: "Down",
      Down: "Up",
    },
  };

  return flippedDirections[axis]?.[direction] || direction;
}

async function saveCameraPreset(slot) {
  const existingPreset = app.cameraPresets.find((preset) => Number(preset.presetId) === slot);
  const cameraId = normalizeXapiNumber(existingPreset?.cameraId || getPrimaryCameraId());
  const params = {
    CameraId: cameraId,
    DefaultPosition: "False",
    ListPosition: slot,
    Name: String(slot),
    PresetId: slot,
    TakeSnapshot: "True",
  };
  const sent = await sendXapiOverDataChannel("xCommand/Camera/Preset/Store", params, {
    successMessage: `${existingPreset ? "Updated" : "Saved"} camera view as preset ${slot}.`,
  });

  if (!sent) {
    return false;
  }

  app.savePresetPickerOpen = false;
  render();
  window.setTimeout(requestCameraPresetsOverDataChannel, 600);
  return true;
}

function getPrimaryCameraId() {
  const camera =
    app.availableCameras.find((entry) => {
      const connected = normalizeStatusToken(entry.connected);

      return !connected || ["true", "connected", "yes"].includes(connected);
    }) || app.availableCameras[0];

  return normalizeXapiNumber(camera?.id || app.cameraPresets[0]?.cameraId || 1);
}

function normalizeXapiNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) && String(value).trim() !== "" ? number : value;
}

function getOrCreateRoleElement(parent, role, tagName) {
  const selector = `[data-role="${role}"]`;
  const current = parent.querySelector(selector);

  if (current) {
    return current;
  }

  const element = document.createElement(tagName);

  element.dataset.role = role;
  parent.appendChild(element);
  return element;
}

function setTextIfChanged(element, text) {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

function setClassNameIfChanged(element, className) {
  if (element.className !== className) {
    element.className = className;
  }
}

function createEmptyControl(message) {
  const empty = document.createElement("p");

  empty.className = "control-empty";
  empty.textContent = message;
  return empty;
}

function renderLog() {
  app.dom.eventLog.replaceChildren(
    ...app.logs.slice(-8).map((entry) => {
      const listItem = document.createElement("li");

      listItem.className = `log-${entry.level}`;
      listItem.textContent = `${entry.time} ${entry.message}`;
      return listItem;
    })
  );
}

function addLog(message, level = "info") {
  app.logs.push({
    level,
    message,
    time: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  });

  console[level === "error" ? "error" : "log"](message);
  render();
}

function describeHidDevice(device) {
  if (!device) {
    return "";
  }

  const vendorId = toHex(device.vendorId);
  const productId = toHex(device.productId);

  return `Vendor ${vendorId}, product ${productId}, ${device.collections?.length || 0} HID collection(s)`;
}

function getDeviceDisplayName(device = {}) {
  return (
    device.metadata?.userAssignedName ||
    device.identity?.displayName ||
    device.productName ||
    device.displayName ||
    "paired device"
  );
}

function getOAuthCredentialsFromUrl() {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(window.location.search);
  const accessToken = hashParams.get("access_token") || searchParams.get("access_token");

  if (!accessToken) {
    return null;
  }

  const returnedState = hashParams.get("state") || searchParams.get("state");
  const expectedState = sessionStorage.getItem(getOAuthStorageKey("state"));

  sessionStorage.removeItem(getOAuthStorageKey("state"));

  if (!returnedState || !expectedState || returnedState !== expectedState) {
    cleanOAuthUrl();
    addLog("Webex sign-in blocked: OAuth state was missing or did not match.", "error");
    return null;
  }

  const expiresIn = Number(hashParams.get("expires_in") || searchParams.get("expires_in"));
  const tokenType = hashParams.get("token_type") || searchParams.get("token_type") || "Bearer";
  const scopeText = hashParams.get("scope") || searchParams.get("scope") || CONFIG.oauthScopes.join(" ");
  const expiresAt = Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000;

  cleanOAuthUrl();

  return {
    accessToken,
    expiresAt,
    tokenType,
    scopes: scopeText.split(/\s+/).filter(Boolean),
  };
}

function saveOAuthCredentials(credentials) {
  localStorage.setItem(getOAuthStorageKey("access_token"), credentials.accessToken);
  localStorage.setItem(getOAuthStorageKey("expires_at"), String(credentials.expiresAt || ""));
  localStorage.setItem(getOAuthStorageKey("token_type"), credentials.tokenType || "Bearer");
  localStorage.setItem(getOAuthStorageKey("scopes"), (credentials.scopes || []).join(" "));
}

function getStoredOAuthCredentials() {
  const accessToken = localStorage.getItem(getOAuthStorageKey("access_token"));

  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    expiresAt: Number(localStorage.getItem(getOAuthStorageKey("expires_at")) || 0),
    tokenType: localStorage.getItem(getOAuthStorageKey("token_type")) || "Bearer",
    scopes: String(localStorage.getItem(getOAuthStorageKey("scopes")) || "")
      .split(/\s+/)
      .filter(Boolean),
  };
}

function clearStoredOAuthCredentials() {
  [
    "access_token",
    "expires_at",
    "token_type",
    "scopes",
    "state",
  ].forEach((key) => {
    localStorage.removeItem(getOAuthStorageKey(key));
    sessionStorage.removeItem(getOAuthStorageKey(key));
  });
}

function isOAuthCredentialExpired(credentials) {
  return Boolean(credentials?.expiresAt && Date.now() > credentials.expiresAt);
}

function getOAuthStorageKey(key) {
  return `${CONFIG.oauthStoragePrefix}_${key}`;
}

function cleanOAuthUrl() {
  const url = new URL(window.location.href);

  [
    "access_token",
    "expires_in",
    "token_type",
    "scope",
    "state",
  ].forEach((key) => url.searchParams.delete(key));

  url.hash = "";
  window.history.replaceState({}, document.title, url.toString());
}

function isHostedWebApp() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function getResponseBody(response) {
  return response?.body || response;
}

function getLastUrlSegment(url) {
  return String(url || "").split("/").filter(Boolean).pop();
}

function toHex(value) {
  return `0x${Number(value || 0)
    .toString(16)
    .padStart(4, "0")}`;
}

function formatHidUsage(value) {
  if (!Number.isFinite(Number(value))) {
    return "n/a";
  }

  return `${Number(value)} (${toHex(value)})`;
}

function formatHidReportId(value) {
  if (!Number.isFinite(Number(value))) {
    return "n/a";
  }

  return `0x${Number(value).toString(16).padStart(2, "0")}`;
}

function formatHidReportSummary(report) {
  return `${formatHidReportId(report?.reportId)}:${getHidReportByteLength(report)}b`;
}

function getHashParam(name) {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);

  return params.get(name);
}

function formatError(error) {
  return error?.message || error?.body?.message || String(error);
}
