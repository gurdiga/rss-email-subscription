import { AppStorage, makeStorage } from './storage';

export type Stub<F extends Function = Function> = Spy<F>; // Just an alias
export type Spy<F extends Function = Function> = F & {
  calls: any[][];
};

export function makeSpy<F extends Function>(): Spy<F> {
  const spy: any = (...args: any[]) => spy.calls.push(args);

  spy.calls = [];

  return spy;
}

export function makeStub<F extends Function>(stubBody?: F): Spy<F> {
  const stub: any = (...args: any[]) => {
    stub.calls.push(args);

    return stubBody?.apply(null, args);
  };

  stub.calls = [];

  return stub;
}

export function makeThrowingStub<F extends Function>(error: Error): Spy<F> {
  return (() => {
    throw error;
  }) as any;
}

/** URL-encodes string */
export function encodeSearchParamValue(string: string): string | undefined {
  return new URLSearchParams({ string }).toString().split('=')[1];
}

interface AppStorageStub extends AppStorage {
  storeItem: Stub<AppStorage['storeItem']> | AppStorage['storeItem'];
  loadItem: Stub<AppStorage['loadItem']> | AppStorage['loadItem'];
  hasItem: Stub<AppStorage['hasItem']> | AppStorage['hasItem'];
  removeItem: Stub<AppStorage['removeItem']> | AppStorage['removeItem'];
  listItems: Stub<AppStorage['listItems']> | AppStorage['listItems'];
  listSubdirectories: Stub<AppStorage['listSubdirectories']> | AppStorage['listSubdirectories'];
}

export function makeStorageStub<K extends keyof AppStorage>(stubBodies: Record<K, AppStorageStub[K]>): AppStorageStub {
  let methodStubs: any = {};

  for (const methodName in stubBodies) {
    methodStubs[methodName] = makeStub(stubBodies[methodName]);
  }

  return {
    ...makeStorage('/test-data'),
    ...methodStubs,
  };
}

export function makeMockElement<T extends HTMLElement>(props: Partial<T> = {}): T {
  if ('classList' in props) {
    (props.classList as any) = makeClassList();
  }

  return props as T;

  function makeClassList() {
    let _classList = new Set<string>();

    return {
      add: (...classNames: string[]) => {
        classNames.forEach((className) => _classList.add(className));
      },
      contains: (className: string) => {
        return _classList.has(className);
      },
    } as DOMTokenList;
  }
}
