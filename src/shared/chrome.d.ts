// Minimal Chrome Extension MV3 ambient type declarations
declare namespace chrome {
  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | Record<string, any> | null): Promise<Record<string, any>>;
      set(items: Record<string, any>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }
    const local: StorageArea;
    const session: StorageArea;
    const onChanged: {
      addListener(
        callback: (
          changes: Record<string, { oldValue?: any; newValue?: any }>,
          areaName: string
        ) => void
      ): void;
      removeListener(callback: (...args: any[]) => void): void;
    };
  }

  namespace runtime {
    interface MessageSender {
      tab?: tabs.Tab;
      id?: string;
      url?: string;
    }
    const lastError: { message?: string } | undefined;
    function sendMessage(message: any, responseCallback?: (response: any) => void): Promise<any>;
    function openOptionsPage(callback?: () => void): Promise<void>;
    function getURL(path: string): string;
    const onMessage: {
      addListener(
        callback: (
          message: any,
          sender: MessageSender,
          sendResponse: (response?: any) => void
        ) => boolean | void | Promise<any>
      ): void;
      removeListener(callback: (...args: any[]) => void): void;
    };
    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
    };
  }

  namespace tabs {
    interface Tab {
      id?: number;
      index?: number;
      windowId?: number;
      highlighted?: boolean;
      active?: boolean;
      pinned?: boolean;
      audible?: boolean;
      discarded?: boolean;
      autoDiscardable?: boolean;
      groupId?: number;
      url?: string;
      pendingUrl?: string;
      title?: string;
      favIconUrl?: string;
      status?: string;
    }
    function query(queryInfo: Record<string, any>): Promise<Tab[]>;
    function get(tabId: number): Promise<Tab>;
    function create(createProperties: { url?: string; active?: boolean; windowId?: number }): Promise<Tab>;
    function update(tabId: number, updateProperties: { active?: boolean; url?: string; pinned?: boolean }): Promise<Tab>;
    function remove(tabIds: number | number[]): Promise<void>;
    function discard(tabId?: number): Promise<Tab>;
    function group(options: { tabIds: number | number[]; groupId?: number; createProperties?: { windowId?: number } }): Promise<number>;
    function ungroup(tabIds: number | number[]): Promise<void>;
    function captureVisibleTab(
      windowId?: number | { format?: 'jpeg' | 'png'; quality?: number },
      options?: { format?: 'jpeg' | 'png'; quality?: number }
    ): Promise<string>;
    function sendMessage(tabId: number, message: any, responseCallback?: (response: any) => void): Promise<any>;
    const TAB_ID_NONE: number;
    const onActivated: {
      addListener(callback: (activeInfo: { tabId: number; windowId: number }) => void): void;
    };
    const onUpdated: {
      addListener(callback: (tabId: number, changeInfo: { status?: string; url?: string; title?: string }, tab: Tab) => void): void;
    };
    const onRemoved: {
      addListener(callback: (tabId: number, removeInfo: { windowId: number; isWindowClosing: boolean }) => void): void;
    };
  }

  namespace tabGroups {
    type ColorEnum = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';
    interface TabGroup {
      id: number;
      collapsed: boolean;
      color: ColorEnum;
      title?: string;
      windowId: number;
    }
    function get(groupId: number): Promise<TabGroup>;
    function query(queryInfo: {
      collapsed?: boolean;
      color?: ColorEnum;
      title?: string;
      windowId?: number;
    }): Promise<TabGroup[]>;
    function update(
      groupId: number,
      updateProperties: { collapsed?: boolean; color?: ColorEnum; title?: string }
    ): Promise<TabGroup>;
    function move(groupId: number, moveProperties: { index: number; windowId?: number }): Promise<TabGroup>;
    const TAB_GROUP_ID_NONE: number;
  }

  namespace scripting {
    interface InjectionResult<T = any> {
      result?: T;
      frameId: number;
    }
    function executeScript<T = any>(injection: {
      target: { tabId: number; allFrames?: boolean };
      func?: (...args: any[]) => T;
      args?: any[];
      files?: string[];
    }): Promise<InjectionResult<T>[]>;
  }

  namespace alarms {
    interface Alarm {
      name: string;
      scheduledTime: number;
      periodInMinutes?: number;
    }
    function create(name: string, alarmInfo: { delayInMinutes?: number; periodInMinutes?: number; when?: number }): Promise<void>;
    function clear(name?: string): Promise<boolean>;
    const onAlarm: {
      addListener(callback: (alarm: Alarm) => void): void;
    };
  }
}
