/* eslint-disable @typescript-eslint/no-unused-vars */
import { create } from 'zustand';
import { toCollectionStore } from 'simply-stated/zustand';
import { fetchMachine } from '../example-machines';
import { is } from 'simply-stated';

const useFetchesStore = create(toCollectionStore(fetchMachine));

// There are two builtin "lifecycle" methods: addEntity and removeEntity.
const { addEntity, removeEntity, fetch, retry, resolved, refetch, rejected } =
  useFetchesStore.getState();

// States collection is a plain id→state map (object) stored under `collection`.
const fetch1 = useFetchesStore(state => state.collection['fetch1']);

addEntity('fetch2', fetchMachine.state.Idle());
fetch('fetch2', { query: '' });
removeEntity('fetch2');

if (fetch1 && is(fetch1, fetchMachine.state.Success)) {
  console.info('Fetch success! Data:', fetch1.data.value);
}
