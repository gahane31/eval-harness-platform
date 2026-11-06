import { createApp } from 'vue';
import App from './App.vue';
import { installToasts } from './components/ui/toast';
import { router } from './router';
import './styles.css';

const app = createApp(App);
installToasts(app);
app.use(router);
app.mount('#app');
