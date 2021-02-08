class Cabinets {
    constructor() {
        const $this = this;
        const stores = {};

        this.getStores = () => stores;

        this.mount = (store) => {
            stores[store.name] = store;
        };

        this.isMounted = (storeName) => {
            return stores[storeName] !== undefined;
        };

        this.unmount = (storeName) => {
            delete stores[storeName];
        };

        this.findStore = (name) => {
            return stores[name];
        };

        //Cabinets Custom Errors
        class CabinetsError extends Error {
            constructor(message, stateInfo) {
                super(message + CabinetsError.info(stateInfo));
                this.name = "CabinetsError";
            }
            static info(stateInfo) {
                if (stateInfo)
                    return " " + Object.keys(stateInfo)
                        .map(key => `${key} : ${JSON.stringify(stateInfo[key])}`)
                        .join(' , ')
                else return "";
            }
        }

        class SetupStoreError extends CabinetsError {
            constructor(message, stateInfo) {
                super(message, stateInfo);
                this.name = this.name + ".SetupStoreError";
            }
        }

        class ReducerError extends CabinetsError {
            constructor(message, stateInfo) {
                super(message, stateInfo);
                this.name = this.name + ".ReducerError";
            }
        }
        // eslint-disable-next-line
        class AsyncActionError extends CabinetsError {
            constructor(message, stateInfo) {
                super(message, stateInfo);
                this.name = this.name + ".AsyncActionError";
            }
        }

        class MappingError extends CabinetsError {
            constructor(message, stateInfo) {
                super(message, stateInfo);
                this.name = this.name + ".MappingError";
            }
        }
        // eslint-disable-next-line
        class InterceptorError extends CabinetsError {
            constructor(message, stateInfo) {
                super(message, stateInfo);
                this.name = this.name + ".InterceptorError";
            }
        }
        //End Custom Errors
        this.GlobalStore = () => {
            function createAction(name, map = (s, p) => p) {
                const type = { type: name };
                const action = (payload) => {
                    const defActionReturn = {
                        ...type,
                        map: map,
                        toString: () => type.type
                    };
                    if (payload) {
                        return { ...defActionReturn, payload: payload };
                    } else {
                        return defActionReturn;
                    }
                };

                return action;
            }

            function initReducer(name, initState, operations) {
                return {
                    state: initState,
                    name: name,
                    ...operations
                };
            }

            //function initStore(){
            //}
            async function lazyFire(action) {
                return dispatch(action, "lazyActions");
            }

            function fire(action) {
                return dispatch(action);
            }

            function dispatch(action, actionType = "actions") {
                let store;
                try {
                    store = Object.values($this.getStores()).find(
                        (store) => store[actionType][action]
                    );
                    const oldState =
                        typeof store.state === "object" ? { ...store.state } : store.state;

                    //Todo: Error Handling
                    if (store) {
                        const reducerFn = store.reducer[action.type];
                        const ctx = { reducer: store.reducer, fire: store.fire, actions: store.actions };
                        const interceptor =
                            store.interceptors[action.type] !== undefined
                                ? store.interceptors[action.type]
                                : store.interceptors["def"];
                        //Alaways calls action.map to transform the state
                        //preveious to call reducer function, in case map is
                        //not supply creating actions, then default (payload)=> payload
                        //function will be used.

                        //1. payload is mapped prior to be passed to reducer
                        //2. state and mapped payload is passed to interceptor
                        //3. building {state, payload} object spreading later...
                        //4. In case interceptor returns a new state and payload
                        //   overriding previous values, if interceptor does not
                        //   return keeping previous values

                        //1.
                        let mapResult;
                        try {
                            mapResult = action.map(store.state, action.payload);
                        } catch (e) {
                            throw new MappingError("Error while mapping payload prior to pass it to reducer.",
                                {
                                    Store: store.name, "Mapping For Action : ": action.type,
                                    Payload: action.payload, State: store.state, Error: e.message
                                });
                        }
                        //2.
                        let interResult;
                        try {
                            interResult = interceptor(store.state, mapResult, ctx);
                        } catch (e) {
                            throw new InterceptorError("Error while executing interceptor prior to execute reducer.",
                                { Store: store.name, "Interceptor for Action: ": action.type, State: store.state, Error: e.message });
                        }

                        //3.
                        const reducerArgs = { state: store.state, payload: mapResult };
                        //4.
                        const { state, payload } = { ...reducerArgs, ...interResult };

                        //Notifying all subscriber
                        function notify() {
                            if (store.__subs__) {
                                store.__subs__.forEach((sub) => {
                                    if (sub.deps && sub.deps.length > 0) {
                                        for (const dep in sub.deps) {
                                            const propName = sub.deps[dep];

                                            if (oldState[propName] !== store.state[propName]) {
                                                sub.fn(store.state);
                                                break;
                                            }
                                        }
                                    } else sub.fn(store.state);
                                });
                            }
                        }


                        try {
                            if (actionType === "lazy") {
                                reducerFn(state, payload, ctx)
                                    .then(state => {
                                        store.state = state;
                                        notify();
                                    })
                            } else {
                                store.state = reducerFn(state, payload, ctx);
                                notify();
                            }

                        } catch (e) {
                            throw new ReducerError("Error in Reducer Code.",
                                {
                                    Store: store.name, "Reducer for Action: ": action.type, State: store.state,
                                    Payload: action.payload, Error: e.message
                                });
                        }

                        return store.state;
                    }

                } catch (e) {
                    console.error(
                        `Error while executing reducer linked to action: ${action}`,  e );

                    if (e instanceof CabinetsError)
                        throw e;

                    throw new CabinetsError("Error while executing reducer action.",
                        { Store: store.name, Action: action, State: store.state, Error: e.message });
                }
            }

            function subscribe(storeName, fn, deps) {
                if (fn === undefined) return;
                let store = $this.findStore(storeName);
                if (store.__subs__ === undefined) store.__subs__ = [];

                if (store.__subs__.indexOf(fn) === -1)
                    store.__subs__.push({ fn, deps });
            }

            function limitedStore(store) {
                const { state, maps, interceptors, reducer, ...rest } = store;
                return rest;
            }

            function setupStore({
                name,
                initState,
                operations,
                asyncOperations = { def: async (s, p) => p },
                maps = { def: (s, p) => p },
                interceptors = { def: (s, p) => p }
            }) {

                try {
                    const actions = Object.keys(operations)
                        .map((op) => {
                            const mapFn = maps[op] === undefined ? "def" : op;
                            return { [op]: createAction(op, maps[mapFn]) };
                        })
                        .reduce((curr, acc) => {
                            return { ...acc, ...curr };
                        });
                    const lazyActions = Object.keys(asyncOperations)
                        .map((lazyOp) => {
                            const mapFn = maps[lazyOp] === undefined ? "def" : lazyOp;
                            return { [lazyOp]: createAction(lazyOp, maps[mapFn]) };
                        })
                        .reduce((curr, acc,) => {
                            return { ...acc, ...curr };
                        });
                    const store = {
                        name: name,
                        state: initState,
                        actions,
                        lazyActions,
                        reducer: initReducer(name, initState, operations),
                        lazyReducer: initReducer(name, initState, asyncOperations),
                        subscribe: (fn, deps) => subscribe(name, fn, deps),
                        fire,
                        lazyFire,
                        maps,
                        getState: () => {
                            let str = $this.findStore(name);
                            if (str) return str.state;
                        },
                        interceptors
                    };

                    $this.mount(store);
                    return limitedStore(store);

                } catch (e) {
                    throw new SetupStoreError("Error while Setting Up Store",
                        { Store: name, Operations: operations, State: initState, Error: e.message });
                }

            }
            const combiner = (items) =>
                items.reduce((ac, curr) => {
                    if (curr instanceof String) {
                        return (ac += curr);
                    }
                    if (curr instanceof Array) {
                        return [...ac, ...curr];
                    }
                    const combinedItems = { ...ac, ...curr };
                    return combinedItems;
                });

            function arrayToObjSet(array) {
                return array.reduce((curr, acc) => {
                    return { ...acc, ...curr };
                });
            }

            function combineReducers(reducers) {
                return combiner(reducers);
            }

            function combineStores(name, ...limitedStores) {
                const stores = limitedStores.map((limStore) =>
                    $this.findStore(limStore.name)
                );
                const allReducers = combineReducers(
                    stores.map((store) => store.reducer)
                );

                const allLazyReducers = combineReducers(
                    stores.map((store) => store.lazyReducer)
                );

                const allMaps = combiner(stores.map((store) => store.maps));

                const allInterceptors = combiner(
                    stores.map((store) => store.interceptors)
                );
                const combinedName =
                    name === undefined
                        ? stores.map((store) => `${store.name}`).join("-")
                        : name;

                const combinedStates = arrayToObjSet(
                    stores.map((store) => {
                        const state = { [store.name]: store.getState() };
                        return state;
                    })
                );

                const combinedSubs = stores
                    .map((store) => store.__subs__)
                    .filter((subs) => subs !== undefined);
                //Registering new combined Stores...

                const store = setupStore({
                    name: combinedName,
                    initState: combinedStates,
                    operations: allReducers,
                    lazyOperations: allLazyReducers,
                    maps: allMaps,
                    interceptors: allInterceptors
                });

                //Combining all subscribers if they exists
                store.__subs__ = combinedSubs;
                //Unmounting previously mounted stores if they are mounted
                stores.forEach((store) => {
                    if ($this.isMounted(store.name)) {
                        $this.unmount(store.name);
                    }
                });

                return store;
            }

            //Exporting important functions that can be used invkoking GlobalStore
            return {
                setupStore,
                combineStores,
                limitedStore,
                initReducer,
                createAction
            };
        };
    }
}

const cabinet = new Cabinets();

//Defining external API

export const { setupStore, combineStores } = cabinet.GlobalStore();

export function useStore(name) {
    const { limitedStore } = cabinet.GlobalStore();
    return limitedStore(cabinet.findStore(name));
}