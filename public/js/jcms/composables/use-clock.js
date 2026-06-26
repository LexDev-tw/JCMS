import { reactive, onMounted, onUnmounted } from '../vue-api.js?v=0.1.20260626';

export function useClock() {
    const time = reactive({ y: '000', m: '00', d: '00', day: 'M', h: '00', min: '00', s: '00' });
    let clockTimer = null;
    const updateClock = () => {
        const now = new Date();
        time.y = String(now.getFullYear() - 1911); time.m = String(now.getMonth() + 1).padStart(2, '0'); time.d = String(now.getDate()).padStart(2, '0');
        time.day = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][now.getDay()]; time.h = String(now.getHours()).padStart(2, '0'); time.min = String(now.getMinutes()).padStart(2, '0'); time.s = String(now.getSeconds()).padStart(2, '0');
    };
    onMounted(() => { updateClock(); clockTimer = setInterval(updateClock, 1000); });
    onUnmounted(() => { if (clockTimer) clearInterval(clockTimer); });
    return { time };
}