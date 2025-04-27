const { St, GLib, Gio, GObject, Clutter } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const WorkspaceManager = global.workspace_manager;

let bluetoothConnectivityLabel;

class BluetoothExtension {
  constructor() {
    this._signalId = null;
  }

  enable() {
    bluetoothConnectivityLabel = new PanelMenu.Button(0.0);

    let container = new St.BoxLayout({
      vertical: false,
      style_class: "bluetooth-button-container",
    });

    let icon = new St.Icon({
      icon_name: "bluetooth-symbolic",
      style_class: "system-status-icon",
    });

    this.label1 = new St.Label({
      text: " Not Connected ",
      y_align: Clutter.ActorAlign.CENTER,
      reactive: true,
      track_hover: true,
    });

    this.label1.connect("button-press-event", () => {
      GLib.spawn_command_line_async("gnome-control-center bluetooth");
    });

    container.add_child(icon);
    container.add_child(this.label1);

    bluetoothConnectivityLabel.add_child(container);

    Main.panel.addToStatusArea(
      "bluetooth-connected-device",
      bluetoothConnectivityLabel,
    );

    this.getConnectedBluetoothDevices();

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this.getConnectedBluetoothDevices();
      return GLib.SOURCE_REMOVE;
    });

    this.listenToDeviceChanges();
  }

  disable() {
    if (this._signalId) {
      Gio.DBus.system.signal_unsubscribe(this._signalId);
      this._signalId = null;
    }

    if (bluetoothConnectivityLabel) {
      bluetoothConnectivityLabel.destroy();
      bluetoothConnectivityLabel = null;
    }
  }

  getConnectedBluetoothDevices() {
    let bus = Gio.DBus.system;

    bus.call(
      "org.bluez",
      "/",
      "org.freedesktop.DBus.ObjectManager",
      "GetManagedObjects",
      null,
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null,
      (connection, result) => {
        try {
          let [objects] = connection.call_finish(result).deep_unpack();
          let found = false;

          for (let interfaces of Object.entries(objects)) {
            let device = interfaces["org.bluez.Device1"];
            if (device) {
              let name = device.Name?.deep_unpack?.() || "Unknown Device";
              let isConnected = device.Connected?.deep_unpack?.() || false;

              if (isConnected) {
                this.updateLabel(name);
                found = true;
                break;
              }
            }
          }

          if (!found) {
            this.updateLabel("Not Connected");
          }
        } catch (e) {
          logError(e, "Failed to get connected Bluetooth devices");
          this.updateLabel("Error");
        }
      },
    );
  }

  listenToDeviceChanges() {
    this._signalId = Gio.DBus.system.signal_subscribe(
      "org.bluez",
      "org.freedesktop.DBus.Properties",
      "PropertiesChanged",
      null,
      null,
      Gio.DBusSignalFlags.NONE,
      (conn, sender, objectPath, iface, signal, params) => {
        let [interfaceName, changedProps, invalidated] = params.deep_unpack();

        if (interfaceName === "org.bluez.Device1") {
          if ("Connected" in changedProps) {
            let isConnected = changedProps.Connected.deep_unpack();

            // Fetch the device name asynchronously when connected/disconnected
            Gio.DBus.system.call(
              "org.bluez",
              objectPath,
              "org.freedesktop.DBus.Properties",
              "Get",
              GLib.Variant.new("(ss)", ["org.bluez.Device1", "Name"]),
              GLib.VariantType.new("(v)"),
              Gio.DBusCallFlags.NONE,
              -1,
              null,
              (conn, res) => {
                try {
                  let [result] = conn.call_finish(res).deep_unpack();
                  log("Result from DBus call: " + JSON.stringify(result));

                  let deviceName = result.deep_unpack();

                  if (isConnected) {
                    this.updateLabel(deviceName);
                    log("Device connected: " + deviceName);
                  } else {
                    this.updateLabel("Not Connected");
                    log("Device disconnected");
                  }
                } catch (e) {
                  logError(e, "Failed to fetch device name");
                }
              },
            );
          }
        }
      },
    );
  }

  updateLabel(text) {
    if (this.label1) {
      this.label1.set_text(text);
    }
  }
}

function init() {
  return new BluetoothExtension();
}
