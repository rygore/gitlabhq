import Vue from 'vue';
import VueApollo from 'vue-apollo';
import VueRouter from 'vue-router';
import createDefaultClient from '~/lib/graphql';
import CrmContactsRoot from './components/contacts_root.vue';

Vue.use(VueApollo);
Vue.use(VueRouter);

export default () => {
  const el = document.getElementById('js-crm-contacts-app');

  const apolloProvider = new VueApollo({
    defaultClient: createDefaultClient(),
  });

  if (!el) {
    return false;
  }

  const { basePath, groupFullPath, groupIssuesPath, canAdminCrmContact, groupId } = el.dataset;

  const router = new VueRouter({
    base: basePath,
    mode: 'history',
    routes: [
      {
        // eslint-disable-next-line @gitlab/require-i18n-strings
        name: 'Contacts List',
        path: '/',
        component: CrmContactsRoot,
      },
    ],
  });

  return new Vue({
    el,
    router,
    apolloProvider,
    provide: { groupFullPath, groupIssuesPath, canAdminCrmContact, groupId },
    render(createElement) {
      return createElement(CrmContactsRoot);
    },
  });
};
