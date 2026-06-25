/** 民國日期／月份／時間輸入元件 */
import { util } from '../utils.js?v=0.1.20260625a';

export const RocDateInput = {
    props: {
        modelValue: { type: String, default: '' },
        required: { type: Boolean, default: false },
        inputClass: { type: String, default: '' },
        swiss: { type: Boolean, default: false },
        placeholder: { type: String, default: '' },
    },
    emits: ['update:modelValue'],
    data() {
        return { calId: 'roc-d-' + Math.random().toString(36).slice(2, 11) };
    },
    computed: {
        pickerIso() {
            return util.rocDate7ToIso(util.normalizeRocDate7(this.modelValue)) || '';
        },
        wrapClass() {
            return this.swiss
                ? 'flex w-full min-w-0 border border-ink-100 overflow-hidden bg-surface focus-within:border-ink-900'
                : 'flex w-full min-w-0 border border-ink-100 overflow-hidden rounded-sm bg-panel focus-within:ring-1 focus-within:ring-ink-900/20';
        },
        inputClassMerged() {
            const base = this.swiss
                ? 'flex-1 min-w-0 border-0 px-1 py-1.5 text-[12px] font-mono font-bold outline-none bg-transparent tabular-nums leading-tight'
                : 'flex-1 min-w-0 border-0 px-2 py-1.5 text-xs font-mono font-bold outline-none bg-transparent';
            return [base, this.inputClass].filter(Boolean).join(' ');
        },
        iconClass() {
            return this.swiss ? 'ph ph-calendar-blank text-sm text-ink-400 pointer-events-none' : 'ph ph-calendar-blank text-base text-ink-400 pointer-events-none';
        },
        sideColClass() {
            return this.swiss
                ? 'relative shrink-0 w-8 flex items-center justify-center border-l border-ink-100 cursor-pointer hover:bg-ink-100/30'
                : 'relative shrink-0 w-9 flex items-center justify-center border-l border-ink-100 cursor-pointer hover:bg-ink-100/30';
        },
    },
    methods: {
        onText(e) {
            this.$emit('update:modelValue', e.target.value.replace(/\D/g, '').slice(0, 7));
        },
        onPick(e) {
            const v = e.target.value;
            if (v) this.$emit('update:modelValue', util.isoToRocDate7(v));
        },
    },
    template: `
        <div :class="wrapClass">
            <input type="text" :value="modelValue" @input="onText" :required="required" maxlength="7" inputmode="numeric" autocomplete="off" :placeholder="placeholder"
                :class="inputClassMerged" />
            <label :for="calId" :class="sideColClass" title="日曆">
                <i :class="iconClass"></i>
                <input type="date" :id="calId" tabindex="-1" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full" :value="pickerIso" @change="onPick" />
            </label>
        </div>
    `,
};

export const RocMonthInput = {
    props: {
        modelValue: { type: String, default: '' },
        required: { type: Boolean, default: false },
        inputClass: { type: String, default: '' },
        swiss: { type: Boolean, default: false },
    },
    emits: ['update:modelValue'],
    data() {
        return { mid: 'roc-m-' + Math.random().toString(36).slice(2, 11) };
    },
    computed: {
        pickerMonth() {
            const s = util.normalizeRocMonth5(this.modelValue);
            return s.length === 5 ? util.rocMonth5ToYyyyMm(s) : '';
        },
        wrapClass() {
            return this.swiss
                ? 'flex w-full min-w-0 border border-ink-100 overflow-hidden bg-surface focus-within:border-ink-900'
                : 'flex w-full min-w-0 border border-ink-100 overflow-hidden rounded-sm bg-panel focus-within:ring-1 focus-within:ring-ink-900/20';
        },
        inputClassMerged() {
            const base = this.swiss
                ? 'flex-1 min-w-0 border-0 px-1 py-1.5 text-[12px] font-mono font-bold outline-none bg-transparent tabular-nums leading-tight'
                : 'flex-1 min-w-0 border-0 px-2 py-1.5 text-xs font-mono font-bold outline-none bg-transparent';
            return [base, this.inputClass].filter(Boolean).join(' ');
        },
        iconClass() {
            return this.swiss ? 'ph ph-calendar-blank text-sm text-ink-400 pointer-events-none' : 'ph ph-calendar-blank text-base text-ink-400 pointer-events-none';
        },
        sideColClass() {
            return this.swiss
                ? 'relative shrink-0 w-8 flex items-center justify-center border-l border-ink-100 cursor-pointer hover:bg-ink-100/30'
                : 'relative shrink-0 w-9 flex items-center justify-center border-l border-ink-100 cursor-pointer hover:bg-ink-100/30';
        },
    },
    methods: {
        onText(e) {
            this.$emit('update:modelValue', e.target.value.replace(/\D/g, '').slice(0, 5));
        },
        onPick(e) {
            const v = e.target.value;
            if (v) this.$emit('update:modelValue', util.yyyyMmToRocMonth5(v));
        },
    },
    template: `
        <div :class="wrapClass">
            <input type="text" :value="modelValue" @input="onText" :required="required" maxlength="5" inputmode="numeric" autocomplete="off" placeholder="11503"
                :class="inputClassMerged" />
            <label :for="mid" :class="sideColClass" title="月份">
                <i :class="iconClass"></i>
                <input type="month" :id="mid" tabindex="-1" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full" :value="pickerMonth" @change="onPick" />
            </label>
        </div>
    `,
};

export const RocTimeInput = {
    props: {
        modelValue: { type: String, default: '' },
        inputClass: { type: String, default: '' },
        swiss: { type: Boolean, default: false },
        /** 空字串時起迄欄不顯示範例數字，僅留白 */
        placeholder: { type: String, default: '1430' },
    },
    emits: ['update:modelValue'],
    data() {
        return { tid: 'roc-t-' + Math.random().toString(36).slice(2, 11) };
    },
    computed: {
        pickerTime() {
            const raw = String(this.modelValue || '').replace(/\D/g, '');
            if (raw.length !== 4) return '';
            return util.rocTime4ToHHMM(util.normalizeRocTime4(this.modelValue));
        },
        wrapClass() {
            return this.swiss
                ? 'flex w-full min-w-0 border border-ink-100 overflow-hidden bg-surface focus-within:border-ink-900'
                : 'flex w-full min-w-0 border border-ink-100 overflow-hidden rounded-sm bg-panel focus-within:ring-1 focus-within:ring-ink-900/20';
        },
        inputClassMerged() {
            const base = this.swiss
                ? 'flex-1 min-w-0 border-0 px-1 py-1 text-[12px] font-mono font-bold outline-none bg-transparent tabular-nums'
                : 'flex-1 min-w-0 border-0 px-2 py-1.5 text-xs font-mono outline-none bg-transparent';
            return [base, this.inputClass].filter(Boolean).join(' ');
        },
        iconClass() {
            return this.swiss ? 'ph ph-clock text-sm text-ink-400 pointer-events-none' : 'ph ph-clock text-base text-ink-400 pointer-events-none';
        },
        sideColClass() {
            return this.swiss
                ? 'relative shrink-0 w-8 flex items-center justify-center border-l border-ink-100 cursor-pointer hover:bg-ink-100/30'
                : 'relative shrink-0 w-9 flex items-center justify-center border-l border-ink-100 cursor-pointer hover:bg-ink-100/30';
        },
    },
    methods: {
        onText(e) {
            this.$emit('update:modelValue', e.target.value.replace(/\D/g, '').slice(0, 4));
        },
        onPick(e) {
            const v = e.target.value;
            if (v) this.$emit('update:modelValue', util.hhmmToRocTime4(v));
        },
    },
    template: `
        <div :class="wrapClass">
            <input type="text" :value="modelValue" @input="onText" maxlength="4" inputmode="numeric" autocomplete="off" :placeholder="placeholder"
                :class="inputClassMerged" />
            <label :for="tid" :class="sideColClass" title="時間">
                <i :class="iconClass"></i>
                <input type="time" :id="tid" tabindex="-1" step="60" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full" :value="pickerTime" @change="onPick" />
            </label>
        </div>
    `,
};