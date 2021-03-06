/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public
 * License Version 1.1 (the "MPL"); you may not use this file
 * except in compliance with the MPL. You may obtain a copy of
 * the MPL at http://www.mozilla.org/MPL/
 *
 * Software distributed under the MPL is distributed on an "AS
 * IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 * implied. See the MPL for the specific language governing
 * rights and limitations under the MPL.
 *
 * The Original Code is Enigmail.
 *
 * The Initial Developer of the Original Code is Ramalingam Saravanan.
 * Portions created by Ramalingam Saravanan <svn@xmlterm.org> are
 * Copyright (C) 2001 Ramalingam Saravanan. All Rights Reserved.
 *
 * Contributor(s):
 * Patrick Brunschwig <patrick@enigmail.net>
 * Janosch Rux <rux@informatik.uni-luebeck.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * ***** END LICENSE BLOCK ***** */

Components.utils.import("resource:///modules/iteratorUtils.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/AddonManager.jsm");
Components.utils.import("resource://enigmail/subprocess.jsm");
Components.utils.import("resource://enigmail/pipeConsole.jsm");
Components.utils.import("resource://enigmail/enigmailCore.jsm");
Components.utils.import("resource://enigmail/gpgAgentHandler.jsm");
Components.utils.import("resource://gre/modules/ctypes.jsm");
Components.utils.import("resource://gre/modules/Timer.jsm");
Components.utils.import("resource://enigmail/enigmailConvert.jsm");

try {
  // TB with omnijar
  Components.utils.import("resource:///modules/gloda/mimemsg.js");
}
catch (ex) {
  // "old style" TB
  Components.utils.import("resource://app/modules/gloda/mimemsg.js");
}

Components.utils.import("resource:///modules/MailUtils.js");


const gDummyPKCS7 = 'Content-Type: multipart/mixed;\r\n boundary="------------060503030402050102040303\r\n\r\nThis is a multi-part message in MIME format.\r\n--------------060503030402050102040303\r\nContent-Type: application/x-pkcs7-mime\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\r\n--------------060503030402050102040303\r\nContent-Type: application/x-enigmail-dummy\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\r\n--------------060503030402050102040303--\r\n';

/* Implementations supplied by this module */
const NS_ENIGMAIL_CONTRACTID   = "@mozdev.org/enigmail/enigmail;1";

const NS_ENIGMAILPROTOCOLHANDLER_CONTRACTID =
    "@mozilla.org/network/protocol;1?name=enigmail";

const NS_ENIGMAIL_CID =
  Components.ID("{847b3a01-7ab1-11d4-8f02-006008948af5}");

const NS_ENIGMAILPROTOCOLHANDLER_CID =
  Components.ID("{847b3a11-7ab1-11d4-8f02-006008948af5}");

const NS_ENIGCLINE_SERVICE_CID =
  Components.ID("{847b3ab1-7ab1-11d4-8f02-006008948af5}");

const ENIGMAIL_EXTENSION_ID = "{847b3a00-7ab1-11d4-8f02-006008948af5}";

// Contract IDs and CIDs used by this module
const NS_SIMPLEURI_CONTRACTID   = "@mozilla.org/network/simple-uri;1";
const NS_OBSERVERSERVICE_CONTRACTID = "@mozilla.org/observer-service;1";
const ASS_CONTRACTID = "@mozilla.org/appshell/appShellService;1";
const WMEDIATOR_CONTRACTID = "@mozilla.org/appshell/window-mediator;1";
const NS_IOSERVICE_CONTRACTID       = "@mozilla.org/network/io-service;1";
const NS_SCRIPTABLEINPUTSTREAM_CONTRACTID = "@mozilla.org/scriptableinputstream;1";
const NS_DOMPARSER_CONTRACTID = "@mozilla.org/xmlextras/domparser;1";
const NS_DOMSERIALIZER_CONTRACTID = "@mozilla.org/xmlextras/xmlserializer;1";
const NS_CLINE_SERVICE_CONTRACTID = "@mozilla.org/enigmail/cline-handler;1";
const NS_XPCOM_APPINFO = "@mozilla.org/xre/app-info;1";
const DIR_SERV_CONTRACTID  = "@mozilla.org/file/directory_service;1";

const Cc = Components.classes;
const Ci = Components.interfaces;

// Interfaces
const nsISupports            = Ci.nsISupports;
const nsIObserver            = Ci.nsIObserver;
const nsIProtocolHandler     = Ci.nsIProtocolHandler;
const nsIEnvironment         = Ci.nsIEnvironment;
const nsIEnigmail            = Ci.nsIEnigmail;
const nsICmdLineHandler      = Ci.nsICmdLineHandler;
const nsIWindowWatcher       = Ci.nsIWindowWatcher;
const nsICommandLineHandler  = Ci.nsICommandLineHandler;
const nsIWindowsRegKey       = Ci.nsIWindowsRegKey;
const nsIFactory             = Ci.nsIFactory;

const NS_XPCOM_SHUTDOWN_OBSERVER_ID = "xpcom-shutdown";

var Ec = null;
var EC = EnigmailCore;

///////////////////////////////////////////////////////////////////////////////
// Global variables


var gEnigmailSvc = null;      // Global Enigmail Service

// GPG status flags mapping (see doc/DETAILS file in the GnuPG distribution)
var gStatusFlags = {GOODSIG:         nsIEnigmail.GOOD_SIGNATURE,
                    BADSIG:          nsIEnigmail.BAD_SIGNATURE,
                    ERRSIG:          nsIEnigmail.UNVERIFIED_SIGNATURE,
                    EXPSIG:          nsIEnigmail.EXPIRED_SIGNATURE,
                    REVKEYSIG:       nsIEnigmail.GOOD_SIGNATURE,
                    EXPKEYSIG:       nsIEnigmail.EXPIRED_KEY_SIGNATURE,
                    KEYEXPIRED:      nsIEnigmail.EXPIRED_KEY,
                    KEYREVOKED:      nsIEnigmail.REVOKED_KEY,
                    NO_PUBKEY:       nsIEnigmail.NO_PUBKEY,
                    NO_SECKEY:       nsIEnigmail.NO_SECKEY,
                    IMPORTED:        nsIEnigmail.IMPORTED_KEY,
                    INV_RECP:        nsIEnigmail.INVALID_RECIPIENT,
                    MISSING_PASSPHRASE: nsIEnigmail.MISSING_PASSPHRASE,
                    BAD_PASSPHRASE:  nsIEnigmail.BAD_PASSPHRASE,
                    BADARMOR:        nsIEnigmail.BAD_ARMOR,
                    NODATA:          nsIEnigmail.NODATA,
                    ERROR:           nsIEnigmail.BAD_SIGNATURE | nsIEnigmail.DECRYPTION_FAILED,
                    DECRYPTION_FAILED: nsIEnigmail.DECRYPTION_FAILED,
                    DECRYPTION_OKAY: nsIEnigmail.DECRYPTION_OKAY,
                    TRUST_UNDEFINED: nsIEnigmail.UNTRUSTED_IDENTITY,
                    TRUST_NEVER:     nsIEnigmail.UNTRUSTED_IDENTITY,
                    TRUST_MARGINAL:  nsIEnigmail.UNTRUSTED_IDENTITY,
                    TRUST_FULLY:     nsIEnigmail.TRUSTED_IDENTITY,
                    TRUST_ULTIMATE:  nsIEnigmail.TRUSTED_IDENTITY,
                    CARDCTRL:        nsIEnigmail.CARDCTRL,
                    SC_OP_FAILURE:   nsIEnigmail.SC_OP_FAILURE,
                    UNKNOWN_ALGO:    nsIEnigmail.UNKNOWN_ALGO,
                    SIG_CREATED:     nsIEnigmail.SIG_CREATED,
                    END_ENCRYPTION:  nsIEnigmail.END_ENCRYPTION,
                    INV_SGNR:        0x100000000,
};

///////////////////////////////////////////////////////////////////////////////
// File read/write operations

const NS_LOCAL_FILE_CONTRACTID = "@mozilla.org/file/local;1";

const NS_LOCALFILEOUTPUTSTREAM_CONTRACTID =
                              "@mozilla.org/network/file-output-stream;1";

const NS_RDONLY      = 0x01;
const NS_WRONLY      = 0x02;
const NS_CREATE_FILE = 0x08;
const NS_TRUNCATE    = 0x20;
const DEFAULT_FILE_PERMS = 0x180; // equals 0600

const ENC_TYPE_ATTACH_BINARY = 1;
const ENC_TYPE_ATTACH_ASCII = 2;

const DUMMY_AGENT_INFO = "none";

var gKeyAlgorithms = [];

// Read the contents of a file into a string

function readFile(filePath) {

// @filePath: nsIFile

  if (filePath.exists()) {

    var ioServ = Cc[NS_IOSERVICE_CONTRACTID].getService(Ci.nsIIOService);
    if (!ioServ)
      throw Components.results.NS_ERROR_FAILURE;

    var fileURI = ioServ.newFileURI(filePath);
    var fileChannel = ioServ.newChannel(fileURI.asciiSpec, null, null);

    var rawInStream = fileChannel.open();

    var scriptableInStream = Cc[NS_SCRIPTABLEINPUTSTREAM_CONTRACTID].createInstance(Ci.nsIScriptableInputStream);
    scriptableInStream.init(rawInStream);
    var available = scriptableInStream.available();
    var fileContents = scriptableInStream.read(available);
    scriptableInStream.close();
    return fileContents;
  }
  return "";
}


///////////////////////////////////////////////////////////////////////////////

// path initialization function
// uses persistentDescriptor in case that initWithPath fails
// (seems to happen frequently with UTF-8 characters in path names)
function initPath(localFileObj, pathStr) {
  localFileObj.initWithPath(pathStr);

  if (! localFileObj.exists()) {
    localFileObj.persistentDescriptor = pathStr;
  }
}


// return the useable path (for gpg) of a file object
function getFilePath (nsFileObj, creationMode) {
  if (creationMode == null) creationMode = NS_RDONLY;

  return nsFileObj.path;
}


///////////////////////////////////////////////////////////////////////////////
// Utility functions
///////////////////////////////////////////////////////////////////////////////


// get a Windows registry value (string)
// @ keyPath: the path of the registry (e.g. Software\\GNU\\GnuPG)
// @ keyName: the name of the key to get (e.g. InstallDir)
// @ rootKey: HKLM, HKCU, etc. (according to constants in nsIWindowsRegKey)
function getWinRegistryString(keyPath, keyName, rootKey) {
  var registry = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);

  var retval = "";
  try {
    registry.open(rootKey, keyPath, registry.ACCESS_READ);
    retval = registry.readStringValue(keyName);
    registry.close();
  }
  catch (ex) {}

  return retval;
}

function getUnicodeData(data) {
  // convert output from subprocess to Unicode

  var tmpStream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
  tmpStream.setData(data, data.length);
  var inStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
  inStream.init(tmpStream);
  return inStream.read(tmpStream.available());
}


function ExtractMessageId(uri) {
  var messageId = "";

  var matches = uri.match(/^enigmail:message\/(.+)/);

  if (matches && (matches.length > 1)) {
    messageId = matches[1];
  }

  return messageId;
}

function ExtractMimeMessageId(uri) {
  var messageId = "";

  var matches = uri.match(/^enigmail:mime-message\/(.+)/);

  if (matches && (matches.length > 1)) {
    messageId = matches[1];
  }

  return messageId;
}


///////////////////////////////////////////////////////////////////////////////
// Enigmail protocol handler
///////////////////////////////////////////////////////////////////////////////

function EnigmailProtocolHandler()
{
}

EnigmailProtocolHandler.prototype = {

  classDescription: "Enigmail Protocol Handler",
  classID:          NS_ENIGMAILPROTOCOLHANDLER_CID,
  contractID:       NS_ENIGMAILPROTOCOLHANDLER_CONTRACTID,
  scheme:           "enigmail",
  defaultPort:      -1,
  protocolFlags:    nsIProtocolHandler.URI_INHERITS_SECURITY_CONTEXT |
                    nsIProtocolHandler.URI_LOADABLE_BY_ANYONE |
                    nsIProtocolHandler.URI_NORELATIVE |
                    nsIProtocolHandler.URI_NOAUTH |
                    nsIProtocolHandler.URI_OPENING_EXECUTES_SCRIPT,

  QueryInterface: XPCOMUtils.generateQI([nsIProtocolHandler]),

  newURI: function (aSpec, originCharset, aBaseURI) {
    EC.DEBUG_LOG("enigmail.js: EnigmailProtocolHandler.newURI: aSpec='"+aSpec+"'\n");

    // cut of any parameters potentially added to the URI; these cannot be handled
    if (aSpec.substr(0,14) == "enigmail:dummy") aSpec = "enigmail:dummy";

    var uri = Cc[NS_SIMPLEURI_CONTRACTID].createInstance(Ci.nsIURI);
    uri.spec = aSpec;

    return uri;
  },

  newChannel: function (aURI) {
    EC.DEBUG_LOG("enigmail.js: EnigmailProtocolHandler.newChannel: URI='"+aURI.spec+"'\n");

    var messageId = ExtractMessageId(aURI.spec);
    var mimeMessageId = ExtractMimeMessageId(aURI.spec);

    if (messageId) {
      // Handle enigmail:message/...

      if (!gEnigmailSvc)
        throw Components.results.NS_ERROR_FAILURE;

      var contentType, contentCharset, contentData;

      if (gEnigmailSvc._messageIdList[messageId]) {
        var messageUriObj = gEnigmailSvc._messageIdList[messageId];

        contentType    = messageUriObj.contentType;
        contentCharset = messageUriObj.contentCharset;
        contentData    = messageUriObj.contentData;

        EC.DEBUG_LOG("enigmail.js: EnigmailProtocolHandler.newChannel: messageURL="+messageUriObj.originalUrl+", content length="+contentData.length+", "+contentType+", "+contentCharset+"\n");

        // do NOT delete the messageUriObj now from the list, this will be done once the message is unloaded (fix for bug 9730).

      }
      else if (mimeMessageId) {
        this.handleMimeMessage(mimeMessageId);
      }
      else {

        contentType = "text/plain";
        contentCharset = "";
        contentData = "Enigmail error: invalid URI "+aURI.spec;
      }

      var channel = Ec.newStringChannel(aURI, contentType, "UTF-8", contentData);

      return channel;
    }

    if (aURI.spec == aURI.scheme+":dummy") {
      // Dummy PKCS7 content (to access mimeEncryptedClass)
      channel = Ec.newStringChannel(aURI, "message/rfc822", "", gDummyPKCS7);
      return channel;
    }

    var winName, spec;
    if (aURI.spec == "about:"+aURI.scheme) {
      // About Enigmail
      winName = "about:"+enigmail;
      spec = "chrome://enigmail/content/enigmailAbout.xul";

    } else if (aURI.spec == aURI.scheme+":console") {
      // Display enigmail console messages
      winName = "enigmail:console";
      spec = "chrome://enigmail/content/enigmailConsole.xul";

    } else if (aURI.spec == aURI.scheme+":keygen") {
      // Display enigmail key generation console
      winName = "enigmail:keygen";
      spec = "chrome://enigmail/content/enigmailKeygen.xul";

    } else {
      // Display Enigmail about page
      winName = "about:enigmail";
      spec = "chrome://enigmail/content/enigmailAbout.xul";
    }

    var windowManager = Cc[WMEDIATOR_CONTRACTID].getService(Ci.nsIWindowMediator);

    var winEnum=windowManager.getEnumerator(null);
    var recentWin=null;
    while (winEnum.hasMoreElements() && ! recentWin) {
      var thisWin = winEnum.getNext();
      if (thisWin.location.href==spec) {
        recentWin = thisWin;
      }
    }

    if (recentWin) {
      recentWin.focus();
    } else {
      var appShellSvc = Cc[ASS_CONTRACTID].getService(Ci.nsIAppShellService);
      var domWin = appShellSvc.hiddenDOMWindow;

      domWin.open(spec, "_blank", "chrome,menubar,toolbar,resizable");
    }

    throw Components.results.NS_ERROR_FAILURE;
  },

  handleMimeMessage: function (messageId) {
    EC.DEBUG_LOG("enigmail.js: EnigmailProtocolHandler.handleMimeMessage: messageURL="+messageUriObj.originalUrl+", content length="+contentData.length+", "+contentType+", "+contentCharset+"\n");

  },

  allowPort: function (port, scheme) {
    // non-standard ports are not allowed
    return false;
  }
};


///////////////////////////////////////////////////////////////////////////////
// Enigmail encryption/decryption service
///////////////////////////////////////////////////////////////////////////////


// Locates STRing in TEXT occurring only at the beginning of a line
function IndexOfArmorDelimiter(text, str, offset) {
  //EC.DEBUG_LOG("enigmail.js: IndexOfArmorDelimiter: "+str+", "+offset+"\n");

  while (offset < text.length) {

    var loc = text.indexOf(str, offset);

    if ((loc < 1) || (text.charAt(loc-1) == "\n"))
      return loc;

    offset = loc + str.length;
  }

  return -1;
}


function Enigmail()
{
  Components.utils.import("resource://enigmail/enigmailCommon.jsm");
  Components.utils.import("resource://enigmail/commonFuncs.jsm");
  Ec = EnigmailCommon;
  EnigmailGpgAgent.setEnigmailCommon(Ec);

}

Enigmail.prototype = {

  classDescription: "Enigmail",
  classID:  NS_ENIGMAIL_CID,
  contractID: NS_ENIGMAIL_CONTRACTID,

  initialized: false,
  initializationAttempted: false,
  initializationError: "",

  isWin32  : false,

  prefBranch: null,
  keygenProcess: null,  // TODO: remove me
  keygenConsole: null,

  agentType: "",
  agentPath: null,
  connGpgAgentPath: null,
  gpgconfPath: null,
  agentVersion: "",
  gpgAgentProcess: null,
  userIdList: null,
  secretKeyList: null,
  rulesList: null,
  gpgAgentInfo: {preStarted: false, envStr: ""},

  _messageIdList: {},
  _xpcom_factory: {
    createInstance: function (aOuter, iid) {
      // Enigmail is a service -> only instanciate once
      if (gEnigmailSvc == null) {
        gEnigmailSvc = new Enigmail();
      }
      return gEnigmailSvc;
    },
    lockFactory: function (lock) {}
  },
  QueryInterface: XPCOMUtils.generateQI([ nsIEnigmail, nsIObserver, nsISupports ]),


  observe: function (aSubject, aTopic, aData) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.observe: topic='"+aTopic+"' \n");

    if (aTopic == NS_XPCOM_SHUTDOWN_OBSERVER_ID) {
      // XPCOM shutdown
      this.finalize();

    }
    else {
      EC.DEBUG_LOG("enigmail.js: Enigmail.observe: no handler for '"+aTopic+"'\n");
    }
  },

  getLogDirectoryPrefix: function () {
    var logDirectory = "";
    try {
      logDirectory = this.prefBranch.getCharPref("logDirectory");
    } catch (ex) {
    }

    if (!logDirectory)
      return "";

    return logDirectory;
  },


  finalize: function () {
    EC.DEBUG_LOG("enigmail.js: Enigmail.finalize:\n");
    if (!this.initialized) return;

    if (this.gpgAgentProcess != null) {
      EC.DEBUG_LOG("enigmail.js: Enigmail.finalize: stopping gpg-agent PID="+this.gpgAgentProcess+"\n");
      try {
        var libName=subprocess.getPlatformValue(0);
        var libc = ctypes.open(libName);

        //int kill(pid_t pid, int sig);
        var kill = libc.declare("kill",
                              ctypes.default_abi,
                              ctypes.int,
                              ctypes.int32_t,
                              ctypes.int);

        kill(parseInt(this.gpgAgentProcess), 15);
      }
      catch (ex) {
        EC.ERROR_LOG("enigmail.js: Enigmail.finalize ERROR: "+ex+"\n");
      }
    }

    EC.onShutdown();

    EC.setLogLevel(3);
    this.initializationError = "";
    this.initializationAttempted = false;
    this.initialized = false;
  },


  initialize: function (domWindow, version, prefBranch) {
    this.initializationAttempted = true;

    this.prefBranch = prefBranch;

    EC.DEBUG_LOG("enigmail.js: Enigmail.initialize: START\n");
    if (this.initialized) return;

    var ioServ = Cc[NS_IOSERVICE_CONTRACTID].getService(Ci.nsIIOService);


    this.isWin32 = (EC.getOS() == "WINNT");

    var prefix = this.getLogDirectoryPrefix();
    if (prefix) {
      EC.setLogLevel(5);
      EC.setLogDirectory(prefix);
      EC.DEBUG_LOG("enigmail.js: Logging debug output to "+prefix+"/enigdbug.txt\n");
    }

    Ec.initialize(this, EC.getLogLevel());

    var environment;
    try {
      environment = Cc["@mozilla.org/process/environment;1"].getService(nsIEnvironment);

    } catch (ex) {
      this.initializationError = EC.getString("enigmimeNotAvail");
      EC.ERROR_LOG("enigmail.js: Enigmail.initialize: Error - "+this.initializationError+"\n");
      EC.DEBUG_LOG("enigmail.js: Enigmail.initialize: exception="+ex.toString()+"\n");
      throw Components.results.NS_ERROR_FAILURE;
    }

    this.environment = environment;

    var nspr_log_modules = environment.get("NSPR_LOG_MODULES");
    var matches = nspr_log_modules.match(/enigmail.js:(\d+)/);

    if (matches && (matches.length > 1)) {
      EC.setLogLevel(Number(matches[1]));
      EC.WARNING_LOG("enigmail.js: Enigmail: LogLevel="+matches[1]+"\n");
    }

    subprocess.registerLogHandler(function(txt) { EC.ERROR_LOG("subprocess.jsm: "+txt); });

    matches = nspr_log_modules.match(/subprocess:(\d+)/);
    if (matches && (matches.length > 1)) {
      if (matches[1] > 2) subprocess.registerDebugHandler(function(txt) { EC.DEBUG_LOG("subprocess.jsm: "+txt); });
    }


    // Initialize global environment variables list
    var passEnv = [ "GNUPGHOME", "GPGDIR", "ETC",
                    "ALLUSERSPROFILE", "APPDATA", "BEGINLIBPATH",
                    "COMMONPROGRAMFILES", "COMSPEC", "DISPLAY",
                    "ENIGMAIL_PASS_ENV", "ENDLIBPATH",
                    "HOME", "HOMEDRIVE", "HOMEPATH",
                    "LANG", "LANGUAGE", "LC_ALL", "LC_COLLATE",  "LC_CTYPE",
                    "LC_MESSAGES",  "LC_MONETARY", "LC_NUMERIC", "LC_TIME",
                    "LOCPATH", "LOGNAME", "LD_LIBRARY_PATH", "MOZILLA_FIVE_HOME",
                    "NLSPATH", "PATH", "PATHEXT", "PROGRAMFILES", "PWD",
                    "SHELL", "SYSTEMDRIVE", "SYSTEMROOT",
                    "TEMP", "TMP", "TMPDIR", "TZ", "TZDIR", "UNIXROOT",
                    "USER", "USERPROFILE", "WINDIR", "XAUTHORITY" ];

    var passList = this.environment.get("ENIGMAIL_PASS_ENV");
    if (passList) {
      var passNames = passList.split(":");
      for (var k=0; k<passNames.length; k++)
        passEnv.push(passNames[k]);
    }

    Ec.envList = [];
    for (var j=0; j<passEnv.length; j++) {
      var envName = passEnv[j];
      var envValue = this.environment.get(envName);
      if (envValue)
         Ec.envList.push(envName+"="+envValue);
    }

    EC.DEBUG_LOG("enigmail.js: Enigmail.initialize: Ec.envList = "+Ec.envList+"\n");

    try {
      EnigmailConsole.write("Initializing Enigmail service ...\n");

    } catch (ex) {
      this.initializationError = EC.getString("enigmimeNotAvail");
      EC.ERROR_LOG("enigmail.js: Enigmail.initialize: Error - "+this.initializationError+"\n");
      EC.DEBUG_LOG("enigmail.js: Enigmail.initialize: exception="+ex.toString()+"\n");
      throw Components.results.NS_ERROR_FAILURE;
    }

    this.setAgentPath(domWindow);

    this.detectGpgAgent(domWindow);

    if (this.useGpgAgent() && (! EC.isDosLike())) {
      if (this.gpgAgentInfo.envStr != DUMMY_AGENT_INFO)
        Ec.envList.push("GPG_AGENT_INFO="+this.gpgAgentInfo.envStr);
    }


    // Register to observe XPCOM shutdown
    var obsServ = Cc[NS_OBSERVERSERVICE_CONTRACTID].getService();
    obsServ = obsServ.QueryInterface(Ci.nsIObserverService);

    obsServ.addObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID, false);

    Ec.stillActive();
    this.initialized = true;

    EC.DEBUG_LOG("enigmail.js: Enigmail.initialize: END\n");
  },


  useGpgAgent: function() {
    var useAgent = false;

    try {
      if (EC.isDosLike() && !Ec.getGpgFeature("supports-gpg-agent")) {
        useAgent = false;
      }
      else {
        // gpg version >= 2.0.16 launches gpg-agent automatically
        if (Ec.getGpgFeature("autostart-gpg-agent")) {
          useAgent = true;
          EC.DEBUG_LOG("enigmail.js: Setting useAgent to "+useAgent+" for gpg2 >= 2.0.16\n");
        }
        else {
          useAgent = (this.gpgAgentInfo.envStr.length>0 || this.prefBranch.getBoolPref("useGpgAgent"));
        }
      }
    }
    catch (ex) {}
    return useAgent;
  },


  reinitialize: function () {
    this.initialized = false;
    this.initializationAttempted = true;

    EnigmailConsole.write("Reinitializing Enigmail service ...\n");
    this.setAgentPath();
    this.initialized = true;
  },


  determineGpgHomeDir: function () {

    var homeDir = "";

    homeDir = this.environment.get("GNUPGHOME");

    if (! homeDir && this.isWin32) {
      homeDir=getWinRegistryString("Software\\GNU\\GNUPG", "HomeDir", nsIWindowsRegKey.ROOT_KEY_CURRENT_USER);

      if (! homeDir) {
        homeDir = this.environment.get("USERPROFILE");

        if (! homeDir) {
          homeDir = this.environment.get("SystemRoot");
        }

        if (homeDir) homeDir += "\\Application Data\\GnuPG";
      }

      if (! homeDir) homeDir = "C:\\gnupg";
    }

    if (! homeDir) homeDir = this.environment.get("HOME")+"/.gnupg";

    return homeDir;
  },


  setAgentPath: function (domWindow) {
    var agentPath = "";
    try {
      agentPath = this.prefBranch.getCharPref("agentPath");
    } catch (ex) {}

    var agentType = "gpg";

    var agentName = "";

    EnigmailGpgAgent.resetGpgAgent();

    if (EC.isDosLike()) {
      agentName = "gpg2.exe;gpg.exe;gpg1.exe";
    }
    else {
      agentName = "gpg2;gpg;gpg1";
    }


    if (agentPath) {
      // Locate GnuPG executable

      // Append default .exe extension for DOS-Like systems, if needed
      if (EC.isDosLike() && (agentPath.search(/\.\w+$/) < 0))
        agentPath += ".exe";

      try {
        var pathDir = Cc[NS_LOCAL_FILE_CONTRACTID].createInstance(Ci.nsIFile);

        if (! EnigmailGpgAgent.isAbsolutePath(agentPath, EC.isDosLike())) {
          // path relative to Mozilla installation dir
          var ds = Cc[DIR_SERV_CONTRACTID].getService();
          var dsprops = ds.QueryInterface(Ci.nsIProperties);
          pathDir = dsprops.get("CurProcD", Ci.nsIFile);

          var dirs=agentPath.split(RegExp(EC.isDosLike() ? "\\\\" : "/"));
          for (var i=0; i< dirs.length; i++) {
            if (dirs[i]!=".") {
              pathDir.append(dirs[i]);
            }
          }
          pathDir.normalize();
        }
        else {
          // absolute path
          initPath(pathDir, agentPath);
        }
        if (! (pathDir.isFile() /* && pathDir.isExecutable()*/))
          throw Components.results.NS_ERROR_FAILURE;
        agentPath = pathDir.QueryInterface(Ci.nsIFile);

      } catch (ex) {
        this.initializationError = EC.getString("gpgNotFound", [ agentPath ]);
        EC.ERROR_LOG("enigmail.js: Enigmail.initialize: Error - "+this.initializationError+"\n");
        throw Components.results.NS_ERROR_FAILURE;
      }

    } else {
      // Resolve relative path using PATH environment variable
      var envPath = this.environment.get("PATH");

      agentPath = EnigmailGpgAgent.resolvePath(agentName, envPath, EC.isDosLike());

      if (!agentPath && EC.isDosLike()) {
        // DOS-like systems: search for GPG in c:\gnupg, c:\gnupg\bin, d:\gnupg, d:\gnupg\bin
        var gpgPath = "c:\\gnupg;c:\\gnupg\\bin;d:\\gnupg;d:\\gnupg\\bin";
        agentPath = EnigmailGpgAgent.resolvePath(agentName, gpgPath, EC.isDosLike());
      }

      if ((! agentPath) && this.isWin32) {
        // Look up in Windows Registry
        try {
          gpgPath = getWinRegistryString("Software\\GNU\\GNUPG", "Install Directory", nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE);
          agentPath = EnigmailGpgAgent.resolvePath(agentName, gpgPath, EC.isDosLike());
        }
        catch (ex) {}

        if (! agentPath) {
          gpgPath = gpgPath + "\\pub";
          agentPath = EnigmailGpgAgent.resolvePath(agentName, gpgPath, EC.isDosLike());
        }
      }

      if (!agentPath && !EC.isDosLike()) {
        // Unix-like systems: check /usr/bin and /usr/local/bin
        gpgPath = "/usr/bin:/usr/local/bin";
        agentPath = EnigmailGpgAgent.resolvePath(agentName, gpgPath, EC.isDosLike());
      }

      if (!agentPath) {
        this.initializationError = EC.getString("gpgNotInPath");
        EC.ERROR_LOG("enigmail.js: Enigmail: Error - "+this.initializationError+"\n");
        throw Components.results.NS_ERROR_FAILURE;
      }
      agentPath = agentPath.QueryInterface(Ci.nsIFile);
    }

    EC.CONSOLE_LOG("EnigmailAgentPath="+Ec.getFilePathDesc(agentPath)+"\n\n");

    this.agentType = agentType;
    this.agentPath = agentPath;

    var command = agentPath;
    var args = [];
    if (agentType == "gpg") {
       args = [ "--version", "--version", "--batch", "--no-tty", "--charset", "utf-8", "--display-charset", "utf-8" ];
    }

    var exitCode = -1;
    var outStr = "";
    var errStr = "";
    EC.DEBUG_LOG("enigmail.js: Enigmail.setAgentPath: calling subprocess with '"+command.path+"'\n");

    EC.CONSOLE_LOG("enigmail> "+Ec.printCmdLine(command, args)+"\n");

    var proc = {
      command:     command,
      arguments:   args,
      environment: Ec.envList,
      charset: null,
      done: function(result) {
        exitCode = result.exitCode;
        outStr = result.stdout;
        errStr = result.stderr;
      },
      mergeStderr: false
    };

    try {
      subprocess.call(proc).wait();
    } catch (ex) {
      EC.ERROR_LOG("enigmail.js: Enigmail.setAgentPath: subprocess.call failed with '"+ex.toString()+"'\n");
      EC.DEBUG_LOG("  enigmail> DONE with FAILURE\n");
      throw ex;
    }
    EC.DEBUG_LOG("  enigmail> DONE\n");

    if (exitCode != 0) {
      EC.ERROR_LOG("enigmail.js: Enigmail.setAgentPath: gpg failed with exitCode "+exitCode+" msg='"+outStr+" "+errStr+"'\n");
      throw Components.results.NS_ERROR_FAILURE;
    }

    EC.CONSOLE_LOG(outStr+"\n");

    // detection for Gpg4Win wrapper
    if (outStr.search(/^gpgwrap.*;/) == 0) {
      var outLines = outStr.split(/[\n\r]+/);
      var firstLine = outLines[0];
      outLines.splice(0,1);
      outStr = outLines.join("\n");
      agentPath = firstLine.replace(/^.*;[ \t]*/, "");

      EC.CONSOLE_LOG("gpg4win-gpgwrapper detected; EnigmailAgentPath="+agentPath+"\n\n");
    }

    var versionParts = outStr.replace(/[\r\n].*/g,"").replace(/ *\(gpg4win.*\)/i, "").split(/ /);
    var gpgVersion = versionParts[versionParts.length-1];

    EC.DEBUG_LOG("enigmail.js: detected GnuPG version '"+gpgVersion+"'\n");
    this.agentVersion = gpgVersion;

    if (!Ec.getGpgFeature("version-supported")) {
      if (! domWindow) {
        domWindow = Ec.getBestParentWin();
      }
      Ec.alert(domWindow, EC.getString("oldGpgVersion", [ gpgVersion ]));
      throw Components.results.NS_ERROR_FAILURE;
    }

    if (Ec.getGpgFeature("version-deprecated")) {
      if (! domWindow) {
        domWindow = Ec.getBestParentWin();
      }
      Ec.alertPref(domWindow, EC.getString("deprecatedGpgVersion", [ gpgVersion ]),
        "warnDeprecatedGnuPG");
    }


    this.gpgconfPath = this.resolveToolPath("gpgconf");
    this.connGpgAgentPath = this.resolveToolPath("gpg-connect-agent");

    EC.DEBUG_LOG("enigmail.js: Enigmail.setAgentPath: gpgconf found: "+ (this.gpgconfPath ? "yes" : "no") +"\n");

  },

  // resolve the path for GnuPG helper tools
  resolveToolPath: function(fileName) {
    var filePath = Cc[NS_LOCAL_FILE_CONTRACTID].createInstance(Ci.nsIFile);

    if (EC.isDosLike()) {
      fileName += ".exe";
    }

    filePath = gEnigmailSvc.agentPath.clone();

    filePath.normalize(); // resolve symlinks; remove . / .. etc.

    if (filePath) filePath = filePath.parent;
    if (filePath) {
      filePath.append(fileName);
      if (filePath.exists()) {
        filePath.normalize();
        return filePath;
      }
    }

    var foundPath = EnigmailGpgAgent.resolvePath(fileName, gEnigmailSvc.environment.get("PATH"), EC.isDosLike());
    if (foundPath != null) { foundPath.normalize(); }
    return foundPath;
  },

  detectGpgAgent: function (domWindow) {
    EC.DEBUG_LOG("enigmail.js: detectGpgAgent\n");

    function extractAgentInfo(fullStr) {
      if (fullStr) {
        fullStr = fullStr.replace(/[\r\n]/g, "");
        fullStr = fullStr.replace(/^.*\=/,"");
        fullStr = fullStr.replace(/\;.*$/,"");
        return fullStr;
      }
      else
        return "";
    }

    var gpgAgentInfo = this.environment.get("GPG_AGENT_INFO");
    if (gpgAgentInfo && gpgAgentInfo.length>0) {
      EC.DEBUG_LOG("enigmail.js: detectGpgAgent: GPG_AGENT_INFO variable available\n");
      // env. variable suggests running gpg-agent
      this.gpgAgentInfo.preStarted = true;
      this.gpgAgentInfo.envStr = gpgAgentInfo;
      Ec.gpgAgentIsOptional = false;
    }
    else {
      EC.DEBUG_LOG("enigmail.js: detectGpgAgent: no GPG_AGENT_INFO variable set\n");
      this.gpgAgentInfo.preStarted = false;

      if (Ec.getGpgFeature("supports-gpg-agent")) {
        Ec.gpgAgentIsOptional = false;
        if (Ec.getGpgFeature("autostart-gpg-agent")) {
          EC.DEBUG_LOG("enigmail.js: detectGpgAgent: gpg 2.0.16 or newer - not starting agent\n");
        }
        else {
          var command = null;

          var outStr = "";
          var errorStr = "";
          var exitCode = -1;

          if (this.connGpgAgentPath && this.connGpgAgentPath.isExecutable()) {
            // try to connect to a running gpg-agent

            EC.DEBUG_LOG("enigmail.js: detectGpgAgent: gpg-connect-agent is executable\n");

            this.gpgAgentInfo.envStr = DUMMY_AGENT_INFO;

            command = this.connGpgAgentPath.QueryInterface(Ci.nsIFile);

            EC.CONSOLE_LOG("enigmail> "+command.path+"\n");

            try {
              subprocess.call({
                command: command,
                environment: Ec.envList,
                stdin: "/echo OK\n",
                charset: null,
                done: function(result) {
                  EC.DEBUG_LOG("detectGpgAgent detection terminated with "+result.exitCode+"\n");
                  exitCode = result.exitCode;
                  outStr = result.stdout;
                  errorStr = result.stderr;
                  if (result.stdout.substr(0,2) == "OK") exitCode = 0;
                },
                mergeStderr: false
              }).wait();
            } catch (ex) {
              EC.ERROR_LOG("enigmail.js: detectGpgAgent: "+command.path+" failed\n");
              EC.DEBUG_LOG("  enigmail> DONE with FAILURE\n");
              exitCode = -1;
            }
            Ec.DEBUG_LOG("  enigmail> DONE\n");

            if (exitCode == 0) {
              EC.DEBUG_LOG("enigmail.js: detectGpgAgent: found running gpg-agent\n");
              return;
            }
            else {
              EC.DEBUG_LOG("enigmail.js: detectGpgAgent: no running gpg-agent. Output='"+outStr+"' error text='"+errorStr+"'\n");
            }

          }

          // and finally try to start gpg-agent
          var args = [];
          var commandFile = this.resolveToolPath("gpg-agent");
          var agentProcess = null;

          if ((! commandFile) || (! commandFile.exists())) {
            commandFile = this.resolveToolPath("gpg-agent2");
          }

          if (commandFile  && commandFile.exists()) {
            command = commandFile.QueryInterface(Ci.nsIFile);
          }

          if (command == null) {
            EC.ERROR_LOG("enigmail.js: detectGpgAgent: gpg-agent not found\n");
            Ec.alert(domWindow, EC.getString("gpgAgentNotStarted", [ this.agentVersion ]));
            throw Components.results.NS_ERROR_FAILURE;
          }
        }

        if ((! EC.isDosLike()) && (! Ec.getGpgFeature("autostart-gpg-agent"))) {

          // create unique tmp file
          var ds = Cc[DIR_SERV_CONTRACTID].getService();
          var dsprops = ds.QueryInterface(Ci.nsIProperties);
          var tmpFile = dsprops.get("TmpD", Ci.nsIFile);
          tmpFile.append("gpg-wrapper.tmp");
          tmpFile.createUnique(tmpFile.NORMAL_FILE_TYPE, DEFAULT_FILE_PERMS);
          args = [ command.path,
                   tmpFile.path,
                  "--sh", "--no-use-standard-socket",
                  "--daemon",
                  "--default-cache-ttl", (Ec.getMaxIdleMinutes()*60).toString(),
                  "--max-cache-ttl", "999999" ];  // ca. 11 days

          try {
            var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
            var exec = Ec.getInstallLocation().clone();
            exec.append("wrappers");
            exec.append("gpg-agent-wrapper.sh");
            process.init(exec);
            process.run(true, args, args.length);

            if (! tmpFile.exists()) {
              EC.ERROR_LOG("enigmail.js: detectGpgAgent no temp file created\n");
            }
            else {
              outStr = readFile(tmpFile);
              tmpFile.remove(false);
              exitCode = 0;
            }
          } catch (ex) {
            EC.ERROR_LOG("enigmail.js: detectGpgAgent: failed with '"+ex+"'\n");
            exitCode = -1;
          }

          if (exitCode == 0) {
            this.gpgAgentInfo.envStr = extractAgentInfo(outStr);
            EC.DEBUG_LOG("enigmail.js: detectGpgAgent: started -> "+this.gpgAgentInfo.envStr+"\n");
            this.gpgAgentProcess = this.gpgAgentInfo.envStr.split(":")[1];
          }
          else {
            EC.ERROR_LOG("enigmail.js: detectGpgAgent: gpg-agent output: "+outStr+"\n");
            Ec.alert(domWindow, EC.getString("gpgAgentNotStarted", [ this.agentVersion ]));
            throw Components.results.NS_ERROR_FAILURE;
          }
        }
        else {
          this.gpgAgentInfo.envStr = DUMMY_AGENT_INFO;
          var envFile = Components.classes[NS_LOCAL_FILE_CONTRACTID].createInstance(Ci.nsIFile);
          initPath(envFile, this.determineGpgHomeDir());
          envFile.append("gpg-agent.conf");

          var data="default-cache-ttl " + (Ec.getMaxIdleMinutes()*60)+"\n";
          data += "max-cache-ttl 999999";
          if (! envFile.exists()) {
            try {
              var flags = 0x02 | 0x08 | 0x20;
              var fileOutStream = Cc[NS_LOCALFILEOUTPUTSTREAM_CONTRACTID].createInstance(Ci.nsIFileOutputStream);
              fileOutStream.init(envFile, flags, 0600, 0);
              fileOutStream.write(data, data.length);
              fileOutStream.flush();
              fileOutStream.close();
            }
            catch (ex) {} // ignore file write errors
          }
        }
      }
      else {
        EC.DEBUG_LOG("enigmail.js: detectGpgAgent - gpg 1.x found\n");
      }
    }
    EC.DEBUG_LOG("enigmail.js: detectGpgAgent: GPG_AGENT_INFO='"+this.gpgAgentInfo.envStr+"'\n");
  },


  simpleExecCmd: function (command, args, exitCodeObj, errorMsgObj)
  {
    EC.WRITE_LOG("enigmail.js: Enigmail.simpleExecCmd: command = "+command+" "+args.join(" ")+"\n");

    var envList = [];
    envList = envList.concat(Ec.envList);

    var outputData = "";
    var errOutput  = "";

    EC.CONSOLE_LOG("enigmail> "+EC.printCmdLine(command, args)+"\n");

    try {
      subprocess.call({
        command: command,
        arguments: args,
        charset: null,
        environment: envList,
        done: function(result) {
          exitCodeObj.value = result.exitCode;
          outputData = result.stdout;
          errOutput = result.stderr;
        },
        mergeStderr: false
      }).wait();
    }
    catch (ex) {
      EC.ERROR_LOG("enigmail.js: simpleExecCmd: "+command.path+" failed\n");
      EC.DEBUG_LOG("  enigmail> DONE with FAILURE\n");
      exitCodeObj.value = -1;
    }
    Ec.DEBUG_LOG("  enigmail> DONE\n");

    if (errOutput)
       errorMsgObj.value  = errOutput;

    EC.DEBUG_LOG("enigmail.js: Enigmail.simpleExecCmd: exitCode = "+exitCodeObj.value+"\n");
    EC.DEBUG_LOG("enigmail.js: Enigmail.simpleExecCmd: errOutput = "+errOutput+"\n");

    Ec.stillActive();

    return outputData;
  },


  execCmd: function (command, args, passphrase, input, exitCodeObj, statusFlagsObj,
            statusMsgObj, errorMsgObj, retStatusObj)
  {
    EC.WRITE_LOG("enigmail.js: Enigmail.execCmd: subprocess = '"+command.path+"'\n");

    if ((typeof input) != "string") input = "";
    var prependPassphrase = ((typeof passphrase) == "string");

    var envList = [];
    envList = envList.concat(Ec.envList);

    var preInput;

    if (prependPassphrase) {
      preInput = passphrase;
      input = "\n" + input;

    } else {
      preInput = "";
    }

    if (input.length == 0 && preInput.length == 0)

    EC.CONSOLE_LOG("enigmail> "+EC.printCmdLine(command, args)+"\n");

    var proc = {
      command:     command,
      arguments:   args,
      environment: envList,
      charset: null,
      stdin: function(pipe) {
        if (input.length > 0 || preInput.length > 0) {
          pipe.write(preInput + input);
        }
        pipe.close();
      },
      done: function(result) {
        this.exitCode = result.exitCode;
        this.resultData = result.stdout;
        this.errorData = result.stderr;
      },
      mergeStderr: false,
      resultData: "",
      errorData: "",
      exitCode: -1
    };

    try {
      subprocess.call(proc).wait();
      exitCodeObj.value = proc.exitCode;

    } catch (ex) {
      EC.ERROR_LOG("enigmail.js: Enigmail.execCmd: subprocess.call failed with '"+ex.toString()+"'\n");
      EC.DEBUG_LOG("  enigmail> DONE with FAILURE\n");
      exitCodeObj.value = -1;
    }
    Ec.DEBUG_LOG("  enigmail> DONE\n");

    var outputData = "";
    var errOutput  = "";

    if (proc.resultData) outputData = proc.resultData;
    if (proc.errorData) errOutput  = proc.errorData;

    EC.DEBUG_LOG("enigmail.js: Enigmail.execCmd: exitCode = "+exitCodeObj.value+"\n");
    EC.DEBUG_LOG("enigmail.js: Enigmail.execCmd: errOutput = "+errOutput+"\n");


    if (! retStatusObj) {
      retStatusObj = {};
    }

    errorMsgObj.value = Ec.parseErrorOutput(errOutput, retStatusObj);
    statusFlagsObj.value = retStatusObj.statusFlags;
    statusMsgObj.value = retStatusObj.statusMsg;
    var blockSeparation = retStatusObj.blockSeparation;

    exitCodeObj.value = Ec.fixExitCode(proc.exitCode, statusFlagsObj.value);

    if (blockSeparation.indexOf(" ") > 0) {
      exitCodeObj.value = 2;
    }

    EC.CONSOLE_LOG(errorMsgObj.value+"\n");

    Ec.stillActive();

    return outputData;
  },


  encryptMessage: function (parent, uiFlags, plainText, fromMailAddr, toMailAddr, bccMailAddr, sendFlags,
                            exitCodeObj, statusFlagsObj, errorMsgObj)
  {
    EC.DEBUG_LOG("enigmail.js: Enigmail.encryptMessage: "+plainText.length+" bytes from "+fromMailAddr+" to "+toMailAddr+" ("+sendFlags+")\n");

    exitCodeObj.value    = -1;
    statusFlagsObj.value = 0;
    errorMsgObj.value    = "";

    if (!plainText) {
      EC.DEBUG_LOG("enigmail.js: Enigmail.encryptMessage: NO ENCRYPTION!\n");
      exitCodeObj.value = 0;
      EnigmailCommon.DEBUG_LOG("  <=== encryptMessage()\n");
      return plainText;
    }

    if (!this.initialized) {
      EC.ERROR_LOG("enigmail.js: Enigmail.encryptMessage: not yet initialized\n");
      errorMsgObj.value = Ec.getString("notInit");
      return "";
    }

    var defaultSend = sendFlags & nsIEnigmail.SEND_DEFAULT;
    var signMsg     = sendFlags & nsIEnigmail.SEND_SIGNED;
    var encryptMsg  = sendFlags & nsIEnigmail.SEND_ENCRYPTED;

    if (encryptMsg) {
      // First convert all linebreaks to newlines
      plainText = plainText.replace(/\r\n/g, "\n");
      plainText = plainText.replace(/\r/g,   "\n");

      // we need all data in CRLF according to RFC 4880
      plainText = plainText.replace(/\n/g, "\r\n");
    }

    var inspector = Cc["@mozilla.org/jsinspector;1"].createInstance(Ci.nsIJSInspector);

    var listener = Ec.newSimpleListener(
      function _stdin (pipe) {
        pipe.write(plainText);
        pipe.close();
      },
      function _done(exitCode) {
        // unlock wait
        if (inspector.eventLoopNestLevel > 0) {
          inspector.exitNestedEventLoop();
        }
      });


    var proc = Ec.encryptMessageStart(parent, uiFlags,
                                      fromMailAddr, toMailAddr, bccMailAddr,
                                      null, sendFlags,
                                      listener, statusFlagsObj, errorMsgObj);
    if (! proc) {
      exitCodeObj.value = -1;
      EnigmailCommon.DEBUG_LOG("  <=== encryptMessage()\n");
      return "";
    }

    // Wait for child pipes to close
    inspector.enterNestedEventLoop(0);

    var retStatusObj = {};
    exitCodeObj.value = Ec.encryptMessageEnd(getUnicodeData(listener.stderrData), listener.exitCode,
                                             uiFlags, sendFlags,
                                             listener.stdoutData.length,
                                             retStatusObj);

    statusFlagsObj.value = retStatusObj.statusFlags;
    errorMsgObj.value = retStatusObj.errorMsg;


    if ((exitCodeObj.value == 0) && listener.stdoutData.length == 0)
      exitCodeObj.value = -1;

    if (exitCodeObj.value == 0) {
      // Normal return
      EnigmailCommon.DEBUG_LOG("  <=== encryptMessage()\n");
      return getUnicodeData(listener.stdoutData);
    }

    // Error processing
    EC.DEBUG_LOG("enigmail.js: Enigmail.encryptMessage: command execution exit code: "+exitCodeObj.value+"\n");
    return "";
  },


  // Locates offsets bracketing PGP armored block in text,
  // starting from given offset, and returns block type string.
  // beginIndex = offset of first character of block
  // endIndex = offset of last character of block (newline)
  // If block is not found, the null string is returned;

  locateArmoredBlock: function (text, offset, indentStr, beginIndexObj, endIndexObj,
            indentStrObj) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.locateArmoredBlock: "+offset+", '"+indentStr+"'\n");

    beginIndexObj.value = -1;
    endIndexObj.value = -1;

    var beginIndex = IndexOfArmorDelimiter(text, indentStr+"-----BEGIN PGP ", offset);

    if (beginIndex == -1) {
      var blockStart=text.indexOf("-----BEGIN PGP ");
      if (blockStart>=0) {
        var indentStart=text.search(/\n.*\-\-\-\-\-BEGIN PGP /)+1;
        indentStrObj.value=text.substring(indentStart, blockStart);
        indentStr=indentStrObj.value;
        beginIndex = IndexOfArmorDelimiter(text, indentStr+"-----BEGIN PGP ", offset);
      }
    }

    if (beginIndex == -1)
      return "";

    // Locate newline at end of armor header
    offset = text.indexOf("\n", beginIndex);

    if (offset == -1)
      return "";

    var endIndex = IndexOfArmorDelimiter(text, indentStr+"-----END PGP ", offset);

    if (endIndex == -1)
      return "";

    // Locate newline at end of PGP block
    endIndex = text.indexOf("\n", endIndex);

    if (endIndex == -1) {
      // No terminating newline
      endIndex = text.length - 1;
    }

    var blockHeader = text.substr(beginIndex, offset-beginIndex+1);

    var blockRegex = new RegExp("^" + indentStr +
                                "-----BEGIN PGP (.*)-----\\s*\\r?\\n");

    var matches = blockHeader.match(blockRegex);

    var blockType = "";
    if (matches && (matches.length > 1)) {
        blockType = matches[1];
        EC.DEBUG_LOG("enigmail.js: Enigmail.locateArmoredBlock: blockType="+blockType+"\n");
    }

    if (blockType == "UNVERIFIED MESSAGE") {
      // Skip any unverified message block
      return this.locateArmoredBlock(text, endIndex+1, indentStr,
                                     beginIndexObj, endIndexObj, indentStrObj);
    }

    beginIndexObj.value = beginIndex;
    endIndexObj.value = endIndex;

    return blockType;
  },


/*
 *     locateArmoredBlocks returns an array with GPGBlock positions
 *
 *      Struct:
 *        int obj.begin
 *        int obj.end
 *        string obj.blocktype
 *
 *
 *     @param string text
 *
 *     @return empty array if no block was found
 *
 */
  locateArmoredBlocks: function(text) {
    var indentStr = "";
    var indentStrObj = new Object();
    var beginObj = new Object();
    var endObj   = new Object();
    var blocks = [];
    var i = 0;

    while (( b = this.locateArmoredBlock(text, i, indentStr, beginObj, endObj, indentStrObj)) != "") {
      e = new Object();
      e.begin = beginObj.value;
      e.end = endObj.value;
      e.blocktype = b;
      blocks.push(e);

      i = e.end;
    }

    Ec.DEBUG_LOG("enigmail.js: locateArmorBlocks: Found " + blocks.length + " Blocks\n");
    return blocks;
  },

  extractSignaturePart: function (signatureBlock, part) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.extractSignaturePart: part="+part+"\n");

    // Search for blank line
    var offset = signatureBlock.search(/\n\s*\r?\n/);
    if (offset == -1)
      return "";

    offset = signatureBlock.indexOf("\n", offset+1);
    if (offset == -1)
      return "";

    var beginIndex = signatureBlock.indexOf("-----BEGIN PGP SIGNATURE-----",
                                            offset+1);
    if (beginIndex == -1)
      return "";

    if (part == nsIEnigmail.SIGNATURE_TEXT) {
      var signedText = signatureBlock.substr(offset+1, beginIndex-offset-1);

      // Unescape leading dashes
      signedText = signedText.replace(/^- -/, "-");
      signedText = signedText.replace(/\n- -/g, "\n-");
      signedText = signedText.replace(/\r- -/g, "\r-");

      return signedText;
    }

    // Locate newline at end of armor header
    offset = signatureBlock.indexOf("\n", beginIndex);

    if (offset == -1)
      return "";

    var endIndex = signatureBlock.indexOf("-----END PGP SIGNATURE-----", offset);
    if (endIndex == -1)
      return "";

    var signBlock = signatureBlock.substr(offset, endIndex-offset);

    // Search for blank line
    var armorIndex = signBlock.search(/\n\s*\r?\n/);
    if (armorIndex == -1)
      return "";

    if (part == nsIEnigmail.SIGNATURE_HEADERS) {
      return signBlock.substr(1, armorIndex);
    }

    armorIndex = signBlock.indexOf("\n", armorIndex+1);
    if (armorIndex == -1)
      return "";

    if (part == nsIEnigmail.SIGNATURE_ARMOR) {
      var armorData = signBlock.substr(armorIndex, endIndex-armorIndex);
      armorData = armorData.replace(/\s*/g, "");
      return armorData;
    }

    return "";
  },


  statusObjectFrom: function (signatureObj, exitCodeObj, statusFlagsObj, keyIdObj, userIdObj, sigDetailsObj, errorMsgObj, blockSeparationObj, encToDetailsObj) {
    return {
      signature: signatureObj,
      exitCode: exitCodeObj,
      statusFlags: statusFlagsObj,
      keyId: keyIdObj,
      userId: userIdObj,
      sigDetails: sigDetailsObj,
      message: errorMsgObj,
      blockSeparation: blockSeparationObj,
      encToDetails: encToDetailsObj
    };
  },


  newStatusObject: function () {
    return this.statusObjectFrom({value: ""}, {}, {}, {}, {}, {}, {}, {}, {});
  },


  inlineInnerVerification: function (parent, uiFlags, text, statusObject) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.inlineInnerVerification\n");

    if (text && text.indexOf("-----BEGIN PGP SIGNED MESSAGE-----") == 0) {
      var status = this.newStatusObject();
      var newText = this.decryptMessage(parent, uiFlags, text,
                                        status.signature, status.exitCode, status.statusFlags, status.keyId, status.userId,
                                        status.sigDetails, status.message, status.blockSeparation, status.encToDetails);
      if (status.exitCode.value == 0) {
        text = newText;
        // merge status into status object:
        statusObject.statusFlags.value = statusObject.statusFlags.value | status.statusFlags.value;
        statusObject.keyId.value = status.keyId.value;
        statusObject.userId.value = status.userId.value;
        statusObject.sigDetails.value = status.sigDetails.value;
        statusObject.message.value = status.message.value;
        // we don't merge encToDetails
      }
    }

    return text;
  },


/**
  *  Decrypts a PGP ciphertext and returns the the plaintext
  *
  *in  @parent a window object
  *in  @uiFlags see flag options in nsIEnigmail.idl, UI_INTERACTIVE, UI_ALLOW_KEY_IMPORT
  *in  @cipherText a string containing a PGP Block
  *out @signatureObj
  *out @exitCodeObj contains the exit code
  *out @statusFlagsObj see status flags in nslEnigmail.idl, GOOD_SIGNATURE, BAD_SIGNATURE
  *out @keyIdObj holds the key id
  *out @userIdObj holds the user id
  *out @sigDetailsObj
  *out @errorMsgObj  error string
  *out @blockSeparationObj
  *out @encToDetailsObj  returns in details, which keys the mesage was encrypted for (ENC_TO entries)
  *
  * @return string plaintext ("" if error)
  *
  */
  decryptMessage: function (parent, uiFlags, cipherText,
                            signatureObj, exitCodeObj,
                            statusFlagsObj, keyIdObj, userIdObj, sigDetailsObj, errorMsgObj,
                            blockSeparationObj, encToDetailsObj) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.decryptMessage: "+cipherText.length+" bytes, "+uiFlags+"\n");

    if (! cipherText)
      return "";

    var interactive = uiFlags & nsIEnigmail.UI_INTERACTIVE;
    var allowImport = uiFlags & nsIEnigmail.UI_ALLOW_KEY_IMPORT;
    var unverifiedEncryptedOK = uiFlags & nsIEnigmail.UI_UNVERIFIED_ENC_OK;
    var oldSignature = signatureObj.value;

    EC.DEBUG_LOG("enigmail.js: Enigmail.decryptMessage: oldSignature="+oldSignature+"\n");

    signatureObj.value   = "";
    exitCodeObj.value    = -1;
    statusFlagsObj.value = 0;
    keyIdObj.value       = "";
    userIdObj.value      = "";
    errorMsgObj.value    = "";

    var beginIndexObj = {};
    var endIndexObj = {};
    var indentStrObj = {};
    var blockType = this.locateArmoredBlock(cipherText, 0, "",
                                            beginIndexObj, endIndexObj, indentStrObj);

    if (!blockType || blockType == "SIGNATURE") {
      errorMsgObj.value = EC.getString("noPGPblock");
      statusFlagsObj.value |= nsIEnigmail.DISPLAY_MESSAGE;
      return "";
    }

    var publicKey = (blockType == "PUBLIC KEY BLOCK");

    var verifyOnly = (blockType == "SIGNED MESSAGE");

    var pgpBlock = cipherText.substr(beginIndexObj.value,
                            endIndexObj.value - beginIndexObj.value + 1);

    if (indentStrObj.value) {
      RegExp.multiline = true;
      var indentRegexp = new RegExp("^"+indentStrObj.value, "g");
      pgpBlock = pgpBlock.replace(indentRegexp, "");
      if (indentStrObj.value.substr(-1) == " ") {
         var indentRegexpStr = "^"+indentStrObj.value.replace(/ $/, "$");
         indentRegexp = new RegExp(indentRegexpStr, "g");
         pgpBlock = pgpBlock.replace(indentRegexp, "");
      }
      RegExp.multiline = false;
    }

    // HACK to better support messages from Outlook: if there are empty lines, drop them
    if (pgpBlock.search(/MESSAGE-----\r?\n\r?\nVersion/) >=0) {
      EC.DEBUG_LOG("enigmail.js: Enigmail.decryptMessage: apply Outlook empty line workaround\n");
      pgpBlock = pgpBlock.replace( /\r?\n\r?\n/g, "\n" );
    }

    var head = cipherText.substr(0, beginIndexObj.value);
    var tail = cipherText.substr(endIndexObj.value+1,
                                 cipherText.length - endIndexObj.value - 1);

    if (publicKey) {
      if (!allowImport) {
        errorMsgObj.value = EC.getString("decryptToImport");
        statusFlagsObj.value |= nsIEnigmail.DISPLAY_MESSAGE;
        statusFlagsObj.value |= nsIEnigmail.INLINE_KEY;

        return "";
      }

      // Import public key
      var importFlags = nsIEnigmail.UI_INTERACTIVE;
      exitCodeObj.value = this.importKey(parent, importFlags, pgpBlock, "",
                                         errorMsgObj);
      if (exitCodeObj.value == 0) {
        statusFlagsObj.value |= nsIEnigmail.IMPORTED_KEY;
      }
      return "";
    }

    var newSignature = "";

    if (verifyOnly) {
      newSignature = this.extractSignaturePart(pgpBlock,
                                                nsIEnigmail.SIGNATURE_ARMOR);

      if (oldSignature && (newSignature != oldSignature)) {
        EC.ERROR_LOG("enigmail.js: Enigmail.decryptMessage: Error - signature mismatch "+newSignature+"\n");
        errorMsgObj.value = EC.getString("sigMismatch");
        statusFlagsObj.value |= nsIEnigmail.DISPLAY_MESSAGE;

        return "";
      }
    }

    var startErrorMsgObj = {};
    var noOutput = false;

    var listener = Ec.newSimpleListener(
      function _stdin (pipe) {
          pipe.write(pgpBlock);
          pipe.close();
      });

    var maxOutput = pgpBlock.length * 100;  // limit output to 100 times message size
                                            // to avoid DoS attack
    var proc = Ec.decryptMessageStart(parent, verifyOnly, noOutput, listener,
                                      statusFlagsObj, startErrorMsgObj,
                                      null, maxOutput);

    if (!proc) {
      errorMsgObj.value = startErrorMsgObj.value;
      statusFlagsObj.value |= nsIEnigmail.DISPLAY_MESSAGE;

      return "";
    }

    // Wait for child to close
    proc.wait();

    var plainText = getUnicodeData(listener.stdoutData);

    var retStatusObj = {};
    var exitCode = Ec.decryptMessageEnd(getUnicodeData(listener.stderrData), listener.exitCode,
                                        plainText.length, verifyOnly, noOutput,
                                        uiFlags, retStatusObj);
    exitCodeObj.value = exitCode;
    statusFlagsObj.value = retStatusObj.statusFlags;
    errorMsgObj.value = retStatusObj.errorMsg;

    userIdObj.value = retStatusObj.userId;
    keyIdObj.value = retStatusObj.keyId;
    sigDetailsObj.value = retStatusObj.sigDetails;
    if (encToDetailsObj) {
      encToDetailsObj.value = retStatusObj.encToDetails;
    }
    blockSeparationObj.value = retStatusObj.blockSeparation;

    if ((head.search(/\S/) >= 0) ||
        (tail.search(/\S/) >= 0)) {
      statusFlagsObj.value |= nsIEnigmail.PARTIALLY_PGP;
    }


    if (exitCodeObj.value == 0) {
      // Normal return

      var doubleDashSeparator = false;
      try {
         doubleDashSeparator = this.prefBranch.getBoolPref("doubleDashSeparator");
      } catch(ex) { }

      if (doubleDashSeparator && (plainText.search(/(\r|\n)-- +(\r|\n)/) < 0) ) {
        // Workaround for MsgCompose stripping trailing spaces from sig separator
        plainText = plainText.replace(/(\r|\n)--(\r|\n)/, "$1-- $2");
      }

      statusFlagsObj.value |= nsIEnigmail.DISPLAY_MESSAGE;

      if (verifyOnly && indentStrObj.value) {
        RegExp.multiline = true;
        plainText = plainText.replace(/^/g, indentStrObj.value);
        RegExp.multiline = false;
      }

      return this.inlineInnerVerification(parent, uiFlags, plainText,
                                          this.statusObjectFrom(signatureObj, exitCodeObj, statusFlagsObj, keyIdObj, userIdObj,
                                                                sigDetailsObj, errorMsgObj, blockSeparationObj, encToDetailsObj));
    }

    var pubKeyId = keyIdObj.value;

    if (statusFlagsObj.value & nsIEnigmail.BAD_SIGNATURE) {
      if (verifyOnly && indentStrObj.value) {
        // Probably replied message that could not be verified
        errorMsgObj.value = EC.getString("unverifiedReply")+"\n\n"+errorMsgObj.value;
        return "";
      }

      // Return bad signature (for checking later)
      signatureObj.value = newSignature;

    } else if (pubKeyId &&
               (statusFlagsObj.value & nsIEnigmail.UNVERIFIED_SIGNATURE)) {

      var innerKeyBlock;
      if (verifyOnly) {
        // Search for indented public key block in signed message
        var innerBlockType = this.locateArmoredBlock(pgpBlock, 0, "- ",
                                                     beginIndexObj, endIndexObj,
                                                     indentStrObj);

        if (innerBlockType == "PUBLIC KEY BLOCK") {

          innerKeyBlock = pgpBlock.substr(beginIndexObj.value,
                                     endIndexObj.value - beginIndexObj.value + 1);

          innerKeyBlock = innerKeyBlock.replace(/- -----/g, "-----");

          statusFlagsObj.value |= nsIEnigmail.INLINE_KEY;
          EC.DEBUG_LOG("enigmail.js: Enigmail.decryptMessage: innerKeyBlock found\n");
        }
      }

      if (allowImport) {

        var importedKey = false;

        if (innerKeyBlock) {
          var importErrorMsgObj = {};
          var importFlags2 = nsIEnigmail.UI_INTERACTIVE;
          var exitStatus = this.importKey(parent, importFlags2, innerKeyBlock,
                                          pubKeyId, importErrorMsgObj);

          importedKey = (exitStatus == 0);

          if (exitStatus > 0) {
            Ec.alert(parent, EC.getString("cantImport")+importErrorMsgObj.value);
          }
        }

        if (importedKey) {
          // Recursive call; note that nsIEnigmail.UI_ALLOW_KEY_IMPORT is unset
          // to break the recursion
          var uiFlagsDeep = interactive ? nsIEnigmail.UI_INTERACTIVE : 0;
          signatureObj.value = "";
          return this.decryptMessage(parent, uiFlagsDeep, pgpBlock,
                                      signatureObj, exitCodeObj, statusFlagsObj,
                                      keyIdObj, userIdObj, sigDetailsObj, errorMsgObj);
        }

      }

      if (plainText && !unverifiedEncryptedOK) {
        // Append original PGP block to unverified message
        plainText = "-----BEGIN PGP UNVERIFIED MESSAGE-----\r\n" + plainText +
                    "-----END PGP UNVERIFIED MESSAGE-----\r\n\r\n" + pgpBlock;
      }

    }

    return verifyOnly ? "" : plainText;
  },



  extractKey: function (parent, exportFlags, userId, outputFile, exitCodeObj, errorMsgObj) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.extractKey: "+userId+"\n");

    if (!this.initialized) {
      EC.ERROR_LOG("enigmail.js: Enigmail.extractKey: not yet initialized\n");
      errorMsgObj.value = EC.getString("notInit");
      return "";
    }

    var uidList=userId.split(/[ ,\t]+/);

    var args = Ec.getAgentArgs(true);
    args = args.concat(["-a", "--export"]);
    args = args.concat(uidList);

    var statusFlagsObj = {};
    var statusMsgObj   = {};
    var cmdErrorMsgObj = {};

    var keyBlock = this.execCmd(this.agentPath, args, null, "",
                      exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

    if ((exitCodeObj.value == 0) && !keyBlock)
      exitCodeObj.value = -1;

    if (exitCodeObj.value != 0) {
      errorMsgObj.value = EC.getString("failKeyExtract");

      if (cmdErrorMsgObj.value) {
        errorMsgObj.value += "\n" + EC.printCmdLine(this.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }

      return "";
    }

    if (exportFlags & nsIEnigmail.EXTRACT_SECRET_KEY) {
      args = Ec.getAgentArgs(true);
      args = args.concat(["-a", "--export-secret-keys"]);
      args = args.concat(uidList);

      var secKeyBlock = this.execCmd(this.agentPath, args, null, "",
                      exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

      if ((exitCodeObj.value == 0) && !secKeyBlock)
        exitCodeObj.value = -1;

      if (exitCodeObj.value != 0) {
        errorMsgObj.value = EC.getString("failKeyExtract");

        if (cmdErrorMsgObj.value) {
          errorMsgObj.value += "\n" + EC.printCmdLine(this.agentPath, args);;
          errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
        }

        return "";
      }

      if (keyBlock.substr(-1,1).search(/[\r\n]/)<0) keyBlock += "\n";
      keyBlock+=secKeyBlock;
    }

    if (outputFile) {
      if (! EnigmailFuncs.writeFileContents(outputFile, keyBlock, DEFAULT_FILE_PERMS)) {
        exitCodeObj.value = -1;
        errorMsgObj.value = EC.getString("fileWriteFailed", [ outputFile ]);
      }
      return "";
    }
    return keyBlock;
  },


  // ExitCode == 0  => success
  // ExitCode > 0   => error
  // ExitCode == -1 => Cancelled by user
  importKey: function (parent, uiFlags, msgText, keyId, errorMsgObj) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.importKey: id="+keyId+", "+uiFlags+"\n");

    if (!this.initialized) {
      EC.ERROR_LOG("enigmail.js: Enigmail.importKey: not yet initialized\n");
      errorMsgObj.value = EC.getString("notInit");
      return 1;
    }

    var beginIndexObj = {};
    var endIndexObj   = {};
    var indentStrObj   = {};
    var blockType = this.locateArmoredBlock(msgText, 0, "",
                                            beginIndexObj, endIndexObj,
                                            indentStrObj);

    if (!blockType) {
      errorMsgObj.value = EC.getString("noPGPblock");
      return 1;
    }

    if (blockType != "PUBLIC KEY BLOCK") {
      errorMsgObj.value = EC.getString("notFirstBlock");
      return 1;
    }

    var pgpBlock = msgText.substr(beginIndexObj.value,
                                  endIndexObj.value - beginIndexObj.value + 1);

    var interactive = uiFlags & nsIEnigmail.UI_INTERACTIVE;

    if (interactive) {
      if (!Ec.confirmDlg(parent, EC.getString("importKeyConfirm"), EC.getString("keyMan.button.import"))) {
        errorMsgObj.value = EC.getString("failCancel");
        return -1;
      }
    }

    var args = Ec.getAgentArgs(true);
    args.push("--import");

    var exitCodeObj    = {};
    var statusFlagsObj = {};
    var statusMsgObj   = {};

    var output = this.execCmd(this.agentPath, args, null, pgpBlock,
                        exitCodeObj, statusFlagsObj, statusMsgObj, errorMsgObj);

    var statusMsg = statusMsgObj.value;

    var pubKeyId;

    if (exitCodeObj.value == 0) {
      // Normal return
      this.invalidateUserIdList();
      if (statusMsg && (statusMsg.search("IMPORTED ") > -1)) {
        var matches = statusMsg.match(/(^|\n)IMPORTED (\w{8})(\w{8})/);

        if (matches && (matches.length > 3)) {
          pubKeyId = "0x" + matches[3];
          EC.DEBUG_LOG("enigmail.js: Enigmail.importKey: IMPORTED "+pubKeyId+"\n");
        }
      }
    }

    return exitCodeObj.value;
  },

  importKeyFromFile: function (parent, inputFile, errorMsgObj, importedKeysObj) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.importKeyFromFile: fileName="+inputFile.path+"\n");
    importedKeysObj.value="";

    if (!this.initialized) {
      EC.ERROR_LOG("enigmail.js: Enigmail.importKeyFromFile: not yet initialized\n");
      errorMsgObj.value = EC.getString("notInit");
      return 1;
    }

    var fileName=Ec.getEscapedFilename(getFilePath(inputFile.QueryInterface(Ci.nsIFile)));

    var args = Ec.getAgentArgs(true);
    args.push("--import");
    args.push(fileName);

    var statusFlagsObj = {};
    var statusMsgObj   = {};
    var exitCodeObj    = {};

    var output = this.execCmd(this.agentPath, args, null, "",
                        exitCodeObj, statusFlagsObj, statusMsgObj, errorMsgObj);

    var statusMsg = statusMsgObj.value;

    var keyList = new Array();

    if (exitCodeObj.value == 0) {
      // Normal return
      this.invalidateUserIdList();

      var statusLines = statusMsg.split(/\r?\n/);

      // Discard last null string, if any

      for (var j=0; j<statusLines.length; j++) {
        var matches = statusLines[j].match(/IMPORT_OK ([0-9]+) (\w+)/);
        if (matches && (matches.length > 2)) {
          if (typeof (keyList[matches[2]]) != "undefined") {
            keyList[matches[2]] |= new Number(matches[1]);
          }
          else
            keyList[matches[2]] = new Number(matches[1]);

          EC.DEBUG_LOG("enigmail.js: Enigmail.importKey: imported "+matches[2]+":"+matches[1]+"\n");
        }
      }

      for (j in keyList) {
        importedKeysObj.value += j+":"+keyList[j]+";";
      }
    }

    return exitCodeObj.value;
  },

  createMessageURI: function (originalUrl, contentType, contentCharset, contentData, persist) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.createMessageURI: "+originalUrl+
              ", "+contentType+", "+contentCharset+"\n");

    var messageId = "msg" + Math.floor(Math.random()*1.0e9);

    this._messageIdList[messageId] = {originalUrl:originalUrl,
                                      contentType:contentType,
                                      contentCharset:contentCharset,
                                      contentData:contentData,
                                      persist:persist};

    return "enigmail:message/"+messageId;
  },

  deleteMessageURI: function (uri) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.deleteMessageURI: "+uri+"\n");

    var messageId = ExtractMessageId(uri);

    if (!messageId)
      return false;

    return (delete this._messageIdList[messageId]);
  },

  invalidateUserIdList: function () {
    // clean the userIdList to force reloading the list at next usage
    EC.DEBUG_LOG("enigmail.js: Enigmail.invalidateUserIdList\n");
    this.userIdList = null;
    this.secretKeyList = null;
  },

  // returns the output of --with-colons --list[-secret]-keys
  getUserIdList: function  (secretOnly, refresh, exitCodeObj, statusFlagsObj, errorMsgObj) {

    if (refresh ||
        (secretOnly && this.secretKeyList == null) ||
        ((! secretOnly) && this.userIdList == null)) {
      var args = Ec.getAgentArgs(true);

      if (secretOnly) {
        args=args.concat(["--with-fingerprint", "--fixed-list-mode", "--with-colons", "--list-secret-keys"]);
      }
      else {
        args=args.concat(["--with-fingerprint", "--fixed-list-mode", "--with-colons", "--list-keys"]);
      }

      if (!this.initialized) {
        EC.ERROR_LOG("enigmail.js: Enigmail.getUserIdList: not yet initialized\n");
        errorMsgObj.value = EC.getString("notInit");
        return "";
      }

      statusFlagsObj.value = 0;

      var statusMsgObj   = {};
      var cmdErrorMsgObj = {};

      var listText = this.execCmd(this.agentPath, args, null, "",
                        exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

      if (! (statusFlagsObj.value & nsIEnigmail.BAD_SIGNATURE)) {
        // ignore exit code as recommended by GnuPG authors
        exitCodeObj.value = 0;
      }

      if (exitCodeObj.value != 0) {
        errorMsgObj.value = EC.getString("badCommand");
        if (cmdErrorMsgObj.value) {
          errorMsgObj.value += "\n" + EC.printCmdLine(this.agentPath, args);
          errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
        }

        return "";
      }

      listText=listText.replace(/(\r\n|\r)/g, "\n");
      if (secretOnly) {
        this.secretKeyList = listText;
        return listText;
      }
      this.userIdList = listText;
    }
    else {
      exitCodeObj.value=0;
      statusFlagsObj.value=0;
      errorMsgObj.value="";
    }

    if (secretOnly) {
      return this.secretKeyList;
    }

    return this.userIdList;
  },

  // returns the output of --with-colons --list-sig
  getKeySig: function  (keyId, exitCodeObj, errorMsgObj) {

    var keyIdList = keyId.split(" ");
    var args = Ec.getAgentArgs(true);
    args=args.concat(["--with-fingerprint", "--fixed-list-mode", "--with-colons", "--list-sig"]);
    args=args.concat(keyIdList);

    if (!this.initialized) {
      EC.ERROR_LOG("enigmail.js: Enigmail.getKeySig: not yet initialized\n");
      errorMsgObj.value = EC.getString("notInit");
      return "";
    }

    var statusFlagsObj = {};
    var statusMsgObj   = {};
    var cmdErrorMsgObj = {};

    var listText = this.execCmd(this.agentPath, args, null, "",
                      exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

    if (! (statusFlagsObj.value & nsIEnigmail.BAD_SIGNATURE)) {
      // ignore exit code as recommended by GnuPG authors
      exitCodeObj.value = 0;
    }

    if (exitCodeObj.value != 0) {
      errorMsgObj.value = EC.getString("badCommand");
      if (cmdErrorMsgObj.value) {
        errorMsgObj.value += "\n" + EC.printCmdLine(this.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }

      return "";
    }
    return listText;
  },

  /**
   * Return details of given keys.
   *
   * @param  String  keyId              List of keys with 0x, separated by spaces.
   * @param  Boolean uidOnly            false:
   *                                      return all key details (full output of GnuPG)
   *                                    true:
   *                                      return only the user ID fields. Only UIDs with highest trust
   *                                      level are returned.
   * @param  Boolean withUserAttributes true: if uidOnly include "uat:jpegPhoto" (but not subkey IDs)
   *
   * @return String all key details or list of user IDs separated by \n.
   */
  getKeyDetails: function (keyId, uidOnly, withUserAttributes)
  {
    var args = Ec.getAgentArgs(true);
    var keyIdList = keyId.split(" ");
    args=args.concat([ "--fixed-list-mode", "--with-colons", "--list-keys"]);
    args=args.concat(keyIdList);

    var statusMsgObj   = {};
    var cmdErrorMsgObj = {};
    var statusFlagsObj = {};
    var exitCodeObj = {};

    var listText = this.execCmd(this.agentPath, args, null, "",
                                exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

    if (! (statusFlagsObj.value & nsIEnigmail.BAD_SIGNATURE)) {
      // ignore exit code as recommended by GnuPG authors
      exitCodeObj.value = 0;
    }

    if (exitCodeObj.value != 0) {
      return "";
    }
    listText=listText.replace(/(\r\n|\r)/g, "\n");

    const TRUSTLEVELS_SORTED = EnigmailFuncs.trustlevelsSorted();
    var maxTrustLevel = -1;

    if (uidOnly) {
      var userList="";
      var hideInvalidUid=true;
      var lineArr=listText.split(/\n/);
      for (var i=0; i<lineArr.length; i++) {
        // process lines such as:
        //  tru::1:1395895453:1442881280:3:1:5
        //  pub:f:4096:1:C1B875ED336XX959:2299509307:1546189300::f:::scaESCA:
        //  fpr:::::::::102A1C8CC524A966849C33D7C8B157EA336XX959:
        //  uid:f::::1388511201::67D5B96DC564598D4D4D9E0E89F5B83C9931A154::Joe Fox <joe@fox.com>:
        //  sig:::1:C8B157EA336XX959:2299509307::::Joe Fox <joe@fox.com>:13x:::::2:
        //  sub:e:2048:1:B214734F0F5C7041:1316219469:1199912694:::::e:
        //  sub:f:2048:1:70E7A471DABE08B0:1316221524:1546189300:::::s:
        var lineTokens = lineArr[i].split(/:/);
        switch (lineTokens[0]) {
          case "pub":
            if (EnigmailFuncs.isInvalid(lineTokens[1])) {
              // pub key not valid (anymore)-> display all UID's
              hideInvalidUid = false;
            }
            break;
          case "uid":
            if (uidOnly && hideInvalidUid) {
              var thisTrust = TRUSTLEVELS_SORTED.indexOf(lineTokens[1]);
              if (thisTrust > maxTrustLevel) {
                userList = lineTokens[9] + "\n";
                maxTrustLevel = thisTrust;
              }
              else if (thisTrust == maxTrustLevel) {
                userList += lineTokens[9] + "\n";
              }
              // else do not add uid
            }
            else if (!EnigmailFuncs.isInvalid(lineTokens[1]) || !hideInvalidUid) {
              // UID valid  OR  key not valid, but invalid keys allowed
              userList += lineTokens[9] + "\n";
            }
            break;
          case "uat":
            if (withUserAttributes) {
              if (!EnigmailFuncs.isInvalid(lineTokens[1]) || !hideInvalidUid) {
                // IF  UID valid  OR  key not valid and invalid keys allowed
                userList += "uat:jpegPhoto:" + lineTokens[4] + "\n";
              }
            }
            break;
        }
      }
      return userList.replace(/^\n+/, "").replace(/\n+$/, "").replace(/\n\n+/g, "\n");
    }

    return listText;
  },


  /**
   * Return string with all colon-separated data of key list entry of given key.
   * - key may be pub or sub key.
   *
   * @param  String  keyId of 8 or 16 chars key with optionally leading 0x
   * @return String  entry of first found user IDs with keyId or null if none
   */
  getKeyListEntryOfKey: function (keyId)
  {
    //EC.DEBUG_LOG("enigmail.js: Enigmail.getKeyListEntryOfKey() keyId='"+ keyId +"'\n");
    keyId = keyId.replace(/^0x/, "");

    let statusFlags = {};
    let errorMsg = {};
    let exitCodeObj = {};
    let listText = this.getUserIdList(false, false, exitCodeObj, statusFlags, errorMsg)
    //EC.DEBUG_LOG("enigmail.js: Enigmail.getKeyListEntryOfKey(): listText "+ listText +"\n");

    // listeText contains lines such as:
    // tru::0:1407688184:1424970931:3:1:5
    // pub:f:1024:17:D581C6F8EBB80E50:1107251639:::-:::scESC:
    // fpr:::::::::492A198AEA5EBE5574A1CE00D581C6F8EBB80E50:
    // uid:f::::1107251639::2D505D1F6E744365B3B35FF11F32A19779E3A417::Giosue Vitaglione <gvi@whitestein.com>:
    // sub:f:2048:16:2223D7E0301A66C6:1107251647::::::e:

    // search for key or subkey
    let regexKey = new RegExp("^(pub|sub):[^:]*:[^:]*:[^:]*:[A-Fa-f0-9]*" + keyId + ":", "m");
    let foundPos = listText.search(regexKey);
    //EC.DEBUG_LOG("enigmail.js: Enigmail.getKeyListEntryOfKey(): foundPos="+ foundPos +"\n");
    if (foundPos < 0) {
      return null;
    }

    // find area of key entries in key list
    // note: if subkey matches, key entry starts before
    let regexPub = RegExp("^pub:", "ym");
    let startPos = -1;
    if (listText[foundPos] == "p") {  // ^pub:
      // KEY matches
      startPos = foundPos;
    }
    else {
      // SUBKEY matches
      // search for pub entry right before sub entry
      startPos = 0;
      let match = regexPub.exec(listText.substr(0, foundPos));
      while (match && match.index < foundPos) {
        startPos = match.index;
        match = regexPub.exec(listText)
      }
    }
    // find end of entry (next pub entry or end):
    let endPos = -1;
    let match = regexPub.exec(listText.substr(startPos+1));
    if (match && match.index) {
      endPos = startPos+1 + match.index;
    }
    else {
      endPos = listText.length;
    }
    return listText.substring(startPos, endPos);
  },


  /**
   * Return first found userId of given key.
   * - key may be pub or sub key.
   * @param  String  keyId key with leading 0x
   * @return String  First found of user IDs or null if none
   */
  getFirstUserIdOfKey: function (keyId)
  {
    EC.DEBUG_LOG("enigmail.js: Enigmail.getFirstUserIdOfKey() keyId='"+ keyId +"'\n");

    var entry = this.getKeyListEntryOfKey(keyId);
    if (entry == null) {
      return null;
    }

    var lineArr = entry.split(/\n/);
    //EC.DEBUG_LOG("enigmail.js: Enigmail.getFirstUserIdOfKey(): lineArr: "+ lineArr +"\n");
    for (i=0; i<lineArr.length; ++i) {
      var lineTokens = lineArr[i].split(/:/);
      switch (lineTokens[0]) {
        case "uid":
          {
            let userId = lineTokens[9];
            return userId;
          }
          break;
      }
    }
    return null;
  },


  /**
   * return key ID of public key for subkey
   *
   * @param  String  keyId key with or without leading 0x
   * @return String  public key ID, or null if key not found
   */
  getPubKeyIdForSubkey: function (keyId) {
    var entry = this.getKeyListEntryOfKey(keyId);
    if (entry == null) {
      return null;
    }

    var lineArr = entry.split(/\n/);
    for (i=0; i<lineArr.length; ++i) {
      var lineTokens = lineArr[i].split(/:/);
      switch (lineTokens[0]) {
        case "pub":
          {
            let keyId = lineTokens[4];
            return keyId;
          }
          break;
      }
    }
    return null;
  },

  // returns the output of --with-colons --list-config
  getGnupgConfig: function  (exitCodeObj, errorMsgObj)
  {
    var args = Ec.getAgentArgs(true);

    args=args.concat(["--fixed-list-mode", "--with-colons", "--list-config"]);

    if (!this.initialized) {
      EC.ERROR_LOG("enigmail.js: Enigmail.getGnupgConfig: not yet initialized\n");
      errorMsgObj.value = EC.getString("notInit");
      return "";
    }

    var statusMsgObj   = {};
    var cmdErrorMsgObj = {};
    var statusFlagsObj = {};

    var listText = this.execCmd(this.agentPath, args, null, "",
                      exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

    if (exitCodeObj.value != 0) {
      errorMsgObj.value = EC.getString("badCommand");
      if (cmdErrorMsgObj.value) {
        errorMsgObj.value += "\n" + EC.printCmdLine(this.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }

      return "";
    }

    listText=listText.replace(/(\r\n|\r)/g, "\n");
    return listText;
  },


  encryptAttachment: function (parent, fromMailAddr, toMailAddr, bccMailAddr, sendFlags, inFile, outFile,
            exitCodeObj, statusFlagsObj, errorMsgObj) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.encryptAttachment infileName="+inFile.path+"\n");

    if (!this.initialized) {
      EC.ERROR_LOG("enigmail.js: Enigmail.encryptAttachment: not yet initialized\n");
      errorMsgObj.value = EC.getString("notInit");
      return "";
    }

    statusFlagsObj.value = 0;
    sendFlags |= nsIEnigmail.SEND_ATTACHMENT;

    var asciiArmor = false;
    try {
      asciiArmor = this.prefBranch.getBoolPref("inlineAttachAsciiArmor");
    } catch (ex) {}
    var asciiFlags = (asciiArmor ? ENC_TYPE_ATTACH_ASCII : ENC_TYPE_ATTACH_BINARY);

    var args = Ec.getEncryptCommand(fromMailAddr, toMailAddr, bccMailAddr, "", sendFlags, asciiFlags, errorMsgObj);

    if (! args)
        return null;

    var passphrase = null;
    var signMessage = (sendFlags & nsIEnigmail.SEND_SIGNED);

    if (signMessage ) {
      args = args.concat(Ec.passwdCommand());

      var passwdObj = {};
      var useAgentObj = {};

      if (!Ec.getPassphrase(parent, passwdObj, useAgentObj, 0)) {
         EC.ERROR_LOG("enigmail.js: Enigmail.encryptAttachment: Error - no passphrase supplied\n");

         statusFlagsObj.value |= nsIEnigmail.MISSING_PASSPHRASE;
         return null;
      }

      if (!useAgentObj.value) passphrase = passwdObj.value;
    }

    var inFilePath  = Ec.getEscapedFilename(getFilePath(inFile.QueryInterface(Ci.nsIFile)));
    var outFilePath = Ec.getEscapedFilename(getFilePath(outFile.QueryInterface(Ci.nsIFile)));

    args = args.concat(["--yes", "-o", outFilePath, inFilePath ]);

    var statusMsgObj   = {};
    var cmdErrorMsgObj = {};

    var msg = this.execCmd(this.agentPath, args, passphrase, "",
                      exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

    if (exitCodeObj.value != 0) {

      if (cmdErrorMsgObj.value) {
        errorMsgObj.value = EC.printCmdLine(this.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }
      else {
        errorMsgObj.value = "An unknown error has occurred";
      }

      return "";
    }

    return msg;
  },


  verifyAttachment: function (parent, verifyFile, sigFile,
                              statusFlagsObj, errorMsgObj) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.verifyAttachment:\n");

    var exitCode        = -1;
    var verifyFilePath  = Ec.getEscapedFilename(getFilePath(verifyFile.QueryInterface(Ci.nsIFile)));
    var sigFilePath     = Ec.getEscapedFilename(getFilePath(sigFile.QueryInterface(Ci.nsIFile)));

    var args = Ec.getAgentArgs(true);
    args.push("--verify");
    args.push(sigFilePath);
    args.push(verifyFilePath);

    var listener = Ec.newSimpleListener();

    var proc = Ec.execStart(this.agentPath, args, false, parent,
                              listener, statusFlagsObj);

    if (!proc) {
      return -1;
    }
    proc.wait();

    var retObj = {};

    Ec.decryptMessageEnd (listener.stderrData, listener.exitCode, 1, true, true, nsIEnigmail.UI_INTERACTIVE, retObj);

    if (listener.exitCode == 0) {
      var detailArr = retObj.sigDetails.split(/ /);
      var dateTime = Ec.getDateTime(detailArr[2], true, true);
      var msg1 = retObj.errorMsg.split(/\n/)[0];

      var msg2 = EC.getString("keyAndSigDate", ["0x"+retObj.keyId.substr(-8, 8), dateTime ]);
      errorMsgObj.value = msg1 + "\n" + msg2;
    }
    else {
      errorMsgObj.value = retObj.errorMsg;
    }

    return listener.exitCode;
  },


  decryptAttachment: function (parent, outFile, displayName, byteData,
            exitCodeObj, statusFlagsObj, errorMsgObj) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.decryptAttachment: parent="+parent+", outFileName="+outFile.path+"\n");

    var attachmentHead = byteData.substr(0,200);
    if (attachmentHead.match(/\-\-\-\-\-BEGIN PGP \w+ KEY BLOCK\-\-\-\-\-/)) {
      // attachment appears to be a PGP key file

      if (Ec.confirmDlg(parent, EC.getString("attachmentPgpKey", [ displayName ]),
            EC.getString("keyMan.button.import"), EC.getString("dlg.button.view"))) {
        exitCodeObj.value = this.importKey(parent, 0, byteData, "", errorMsgObj);
        statusFlagsObj.value = gStatusFlags.IMPORTED;
      }
      else {
        exitCodeObj.value = 0;
        statusFlagsObj.value = nsIEnigmail.DISPLAY_MESSAGE;
      }
      return true;
    }

    var outFileName = Ec.getEscapedFilename(getFilePath(outFile.QueryInterface(Ci.nsIFile), NS_WRONLY));

    var args = Ec.getAgentArgs(true);
    args = args.concat(["-o", outFileName, "--yes"]);
    args = args.concat(Ec.passwdCommand());
    args.push("-d");


    statusFlagsObj.value = 0;

    var passphrase = null;
    var passwdObj = {};
    var useAgentObj = {};

    if (!Ec.getPassphrase(parent, passwdObj, useAgentObj, 0)) {
      EC.ERROR_LOG("enigmail.js: Enigmail.decryptAttachment: Error - no passphrase supplied\n");

      statusFlagsObj.value |= nsIEnigmail.MISSING_PASSPHRASE;
      return null;
    }

    passphrase = passwdObj.value;

    var listener = Ec.newSimpleListener(
      function _stdin(pipe) {
        if (Ec.requirePassword()) {
          pipe.write(passphrase+"\n");
        }
        pipe.write(byteData);
        pipe.close();
      });


    var proc = Ec.execStart(this.agentPath, args, false, parent,
                            listener, statusFlagsObj);

    if (!proc) {
      return false;
    }

    // Wait for child STDOUT to close
    proc.wait();

    var statusMsgObj = {};
    var cmdLineObj   = {};

    exitCodeObj.value = Ec.execEnd(listener, statusFlagsObj, statusMsgObj, cmdLineObj, errorMsgObj);

    return true;

  },

  getCardStatus: function(exitCodeObj, errorMsgObj) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.getCardStatus\n");
    var args = Ec.getAgentArgs(false);

    args = args.concat(["--status-fd", "2", "--fixed-list-mode", "--with-colons", "--card-status"]);
    var statusMsgObj = {};
    var statusFlagsObj = {};

    var outputTxt = this.execCmd(this.agentPath, args, null, "",
                  exitCodeObj, statusFlagsObj, statusMsgObj, errorMsgObj);

    if ((exitCodeObj.value == 0) && !outputTxt) {
      exitCodeObj.value = -1;
      return "";
    }

    return outputTxt;
  },

  showKeyPhoto: function(keyId, photoNumber, exitCodeObj, errorMsgObj) {
    EC.DEBUG_LOG("enigmail.js: Enigmail.showKeyPhoto, keyId="+keyId+" photoNumber="+photoNumber+"\n");

    var args = Ec.getAgentArgs();
    args = args.concat(["--no-secmem-warning", "--no-verbose", "--no-auto-check-trustdb", "--batch", "--no-tty", "--status-fd", "1", "--attribute-fd", "2" ]);
    args = args.concat(["--fixed-list-mode", "--list-keys", keyId]);

    var photoDataObj = {};

    var outputTxt = this.simpleExecCmd(this.agentPath, args, exitCodeObj, photoDataObj);

    if (!outputTxt) {
      exitCodeObj.value = -1;
      return "";
    }

    if (EC.isDosLike() && Ec.getGpgFeature("windows-photoid-bug")) {
      // workaround for error in gpg
      photoDataObj.value=photoDataObj.value.replace(/\r\n/g, "\n");
    }

  // [GNUPG:] ATTRIBUTE A053069284158FC1E6770BDB57C9EB602B0717E2 2985
    var foundPicture = -1;
    var skipData = 0;
    var imgSize = -1;
    var statusLines = outputTxt.split(/[\n\r+]/);

    for (var i=0; i < statusLines.length; i++) {
      var matches = statusLines[i].match(/\[GNUPG:\] ATTRIBUTE ([A-F\d]+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)/);
      if (matches && matches[3]=="1") {
        // attribute is an image
        ++foundPicture;
        if (foundPicture == photoNumber) {
          imgSize = Number(matches[2]);
          break;
        }
        else {
          skipData += Number(matches[2]);
        }
      }
    }

    if (foundPicture>=0 && foundPicture == photoNumber) {
      var pictureData = photoDataObj.value.substr(16+skipData, imgSize);
      if (! pictureData.length)
        return "";
      try {
        var flags = NS_WRONLY | NS_CREATE_FILE | NS_TRUNCATE;

        var ds = Cc[DIR_SERV_CONTRACTID].getService();
        var dsprops = ds.QueryInterface(Ci.nsIProperties);
        var picFile = dsprops.get("TmpD", Ci.nsIFile);

        picFile.append(keyId+".jpg");
        picFile.createUnique(picFile.NORMAL_FILE_TYPE, DEFAULT_FILE_PERMS);

        var fileStream = Cc[NS_LOCALFILEOUTPUTSTREAM_CONTRACTID].createInstance(Ci.nsIFileOutputStream);
        fileStream.init(picFile, flags, DEFAULT_FILE_PERMS, 0);
        if (fileStream.write(pictureData, pictureData.length) != pictureData.length)
            throw Components.results.NS_ERROR_FAILURE;

        fileStream.flush();
        fileStream.close();
        return picFile.path;

      }
      catch (ex) {
        exitCodeObj.value = -1;
        return "";
      }
    }
    return "";
  },


  // Methods for handling Per-Recipient Rules

  getRulesFile: function () {
    EC.DEBUG_LOG("enigmail.js: getRulesFile\n");
    var rulesFile = EC.getProfileDirectory();
    rulesFile.append("pgprules.xml");
    return rulesFile;
  },

  loadRulesFile: function () {
    EC.DEBUG_LOG("enigmail.js: loadRulesFile\n");
    var flags = NS_RDONLY;
    var rulesFile = this.getRulesFile();
    if (rulesFile.exists()) {
      var fileContents = readFile(rulesFile);

      if (fileContents.length==0 || fileContents.search(/^\s*$/)==0) {
        return false;
      }

      var domParser=Cc[NS_DOMPARSER_CONTRACTID].createInstance(Ci.nsIDOMParser);
      this.rulesList = domParser.parseFromString(fileContents, "text/xml");

      return true;
    }
    return false;
  },

  saveRulesFile: function () {
    EC.DEBUG_LOG("enigmail.js: saveRulesFile\n");

    var flags = NS_WRONLY | NS_CREATE_FILE | NS_TRUNCATE;
    var domSerializer=Cc[NS_DOMSERIALIZER_CONTRACTID].createInstance(Ci.nsIDOMSerializer);
    var rulesFile = this.getRulesFile();
    if (rulesFile) {
      if (this.rulesList) {
        // the rule list is not empty -> write into file
        return EnigmailFuncs.writeFileContents(rulesFile.path,
                               domSerializer.serializeToString(this.rulesList.firstChild),
                               DEFAULT_FILE_PERMS);
      }
      else {
        // empty rule list -> delete rules file
        try {
          rulesFile.remove(false);
        }
        catch (ex) {}
        return true;
      }
    }
    else
      return false;
  },

  getRulesData: function (rulesListObj) {
    EC.DEBUG_LOG("enigmail.js: getRulesData\n");
    var ret=true;
    if (! this.rulesList) {
       ret=this.loadRulesFile();
    }
    if (this.rulesList) {
      rulesListObj.value = this.rulesList;
      return ret;
    }

    rulesListObj.value = null;
    return false;
  },

  addRule: function (appendToEnd, toAddress, keyList, sign, encrypt, pgpMime, flags) {
    EC.DEBUG_LOG("enigmail.js: addRule\n");
    if (! this.rulesList) {
      var domParser=Cc[NS_DOMPARSER_CONTRACTID].createInstance(Ci.nsIDOMParser);
      this.rulesList = domParser.parseFromString("<pgpRuleList/>", "text/xml");
    }
    var negate = (flags & 1);
    var rule=this.rulesList.createElement("pgpRule");
    rule.setAttribute("email", toAddress);
    rule.setAttribute("keyId", keyList);
    rule.setAttribute("sign", sign);
    rule.setAttribute("encrypt", encrypt);
    rule.setAttribute("pgpMime", pgpMime);
    rule.setAttribute("negateRule", flags);
    var origFirstChild = this.rulesList.firstChild.firstChild;

    if (origFirstChild && (! appendToEnd)) {
      this.rulesList.firstChild.insertBefore(rule, origFirstChild);
      this.rulesList.firstChild.insertBefore(this.rulesList.createTextNode(EC.isDosLike() ? "\r\n" : "\n"), origFirstChild);
    }
    else {
      this.rulesList.firstChild.appendChild(rule);
      this.rulesList.firstChild.appendChild(this.rulesList.createTextNode(EC.isDosLike() ? "\r\n" : "\n"));
    }

  },

  clearRules: function () {
    this.rulesList = null;
  }

}; // Enigmail.protoypte


function EnigCmdLineHandler() {}

EnigCmdLineHandler.prototype = {
  classDescription: "Enigmail Key Management CommandLine Service",
  classID:  NS_ENIGCLINE_SERVICE_CID,
  contractID: NS_CLINE_SERVICE_CONTRACTID,
  _xpcom_categories: [{
    category: "command-line-handler",
    entry: "m-cline-enigmail",
    service: false
  }],
  QueryInterface: XPCOMUtils.generateQI([nsICommandLineHandler, nsIFactory, nsISupports]),

  // nsICommandLineHandler
  handle: function(cmdLine) {
    if (cmdLine.handleFlag("pgpkeyman", false)) {
      cmdLine.preventDefault = true; // do not open main app window

      var wwatch = Cc["@mozilla.org/embedcomp/window-watcher;1"]
                             .getService(Ci.nsIWindowWatcher);
      wwatch.openWindow(null, "chrome://enigmail/content/enigmailKeyManager.xul", "_blank",
                        "chrome,dialog=no,all", cmdLine);
    }
  },

  helpInfo: "  -pgpkeyman         Open the OpenPGP key management.\n",

  lockFactory: function (lock) {}
};

function getEnigmailString(aStr) {
  try {
    var strBundleService = Cc["@mozilla.org/intl/stringbundle;1"].getService();
    strBundleService = strBundleService.QueryInterface(Ci.nsIStringBundleService);
    var enigStringBundle = strBundleService.createBundle("chrome://enigmail/locale/enigmail.properties");
    return enigStringBundle.GetStringFromName(aStr);
  }
  catch (ex) {
    return aStr;
  }
}

/********************************************************************************
  Filter actions for decrypting messages permanently
 ********************************************************************************/

/***
 *  dispatchMessages
 *
 *  Because thunderbird throws all messages at once at us thus we have to rate limit the dispatching
 *  of the message processing. Because there is only a negligible performance gain when dispatching
 *  several message at once we serialize to not overwhelm low power devices.
 *
 *  The function is implemented such that the 1st call (requireSync == true) is a synchronous function,
 *  while any other call is asynchronous. This is required to make the filters work correctly in case
 *  there are other filters that work on the message. (see bug 374).
 *
 *  Parameters
 *   aMsgHdrs:     Array of nsIMsgDBHdr
 *   targetFolder: String; target folder URI
 *   move:         Boolean: type of action; true = "move" / false = "copy"
 *   requireSync:  Boolean: true = require  function to behave synchronously
 *                          false = async function (no useful return value)
 *
 **/

function dispatchMessages(aMsgHdrs, targetFolder, move, requireSync) {
  var inspector = Cc["@mozilla.org/jsinspector;1"].getService(Ci.nsIJSInspector);

  var promise = EnigmailDecryptPermanently(aMsgHdrs[0], targetFolder, move);
  var done = false;

  var processNext = function (data) {
    aMsgHdrs.splice(0,1);
    if (aMsgHdrs.length > 0) {
      dispatchMessages(aMsgHdrs, targetFolder, move, false);
    }
    else {
      // last message was finished processing
      done = true;
      EC.DEBUG_LOG("enigmail.js: dispatchMessage: exit nested loop\n");
      inspector.exitNestedEventLoop();
    }
  };

  promise.then(processNext);

  promise.catch(function(err) {
    EC.ERROR_LOG("enigmail.js: dispatchMessage: caught error: "+err+"\n");
    processNext(null);
  });

  if (requireSync && ! done) {
    // wait here until all messages processed, such that the function returns
    // synchronously
    EC.DEBUG_LOG("enigmail.js: dispatchMessage: enter nested loop\n");
    inspector.enterNestedEventLoop({value : 0});
  }
}

/**
 * filter action for creating a decrypted version of the mail and
 * deleting the original mail at the same time
 */

var filterActionMoveDecrypt = {
  id: "enigmail@enigmail.net#filterActionMoveDecrypt",
  name: EC.getString("filter.decryptMove.label"),
  value: "movemessage",
  apply: function (aMsgHdrs, aActionValue, aListener, aType, aMsgWindow) {

    EC.DEBUG_LOG("enigmail.js: filterActionMoveDecrypt: Move to: " + aActionValue + "\n");

    var msgHdrs = [];

    for(var i=0; i < aMsgHdrs.length; i++) {
      msgHdrs.push(aMsgHdrs.queryElementAt(i, Ci.nsIMsgDBHdr));
    }

    dispatchMessages(msgHdrs, aActionValue, true, true);

    return;
  },

  isValidForType: function (type, scope) {
    return true;
  },

  validateActionValue: function (value, folder, type) {

    if (Ec == null) {
      Enigmail();
      Ec.getService();
    }

    Ec.alert(null, EC.getString("filter.decryptMove.warnExperimental"));

    if (value == "") {
      return EC.getString("filter.folderRequired");
    }

    return null;
  },

  allowDuplicates: false,
  isAsync: false,
  needsBody: true
};

/**
 * filter action for creating a decrypted copy of the mail, leaving the original
 * message untouched
 */
var filterActionCopyDecrypt = {
  id: "enigmail@enigmail.net#filterActionCopyDecrypt",
  name: EC.getString("filter.decryptCopy.label"),
  value: "copymessage",
  apply: function (aMsgHdrs, aActionValue, aListener, aType, aMsgWindow) {
    if (Ec == null) {
      Enigmail();
      Ec.getService();
    }

    Ec.DEBUG_LOG("enigmail.js: filterActionCopyDecrypt: Copy to: " + aActionValue + "\n");

    var msgHdrs = [];

    for(var i=0; i < aMsgHdrs.length; i++) {
      msgHdrs.push(aMsgHdrs.queryElementAt(i, Ci.nsIMsgDBHdr));
    }

    dispatchMessages(msgHdrs, aActionValue, false, true);
    return;
  },

  isValidForType: function (type, scope) {
    return true;
  },

  validateActionValue: function (value, folder, type) {
    if( value == "") {
      return EC.getString("filter.folderRequired");
    }

    return null;
  },

  allowDuplicates: false,
  isAsync: false,
  needsBody: true
};

///////////////////////////////////////////////////////////////////////////////

var NSGetFactory = XPCOMUtils.generateNSGetFactory([Enigmail, EnigmailProtocolHandler, EnigCmdLineHandler]);

var filterService = Cc["@mozilla.org/messenger/services/filters;1"].getService(Ci.nsIMsgFilterService);
filterService.addCustomAction(filterActionMoveDecrypt);
filterService.addCustomAction(filterActionCopyDecrypt);

dump("enigmail.js: Registered components\n");

