<script>
	import db from '@/utils/db.js';

	export default {
		onLaunch: function() {
			console.log('App Launch')
			// Initialize Database
			db.initDB();
		},
		onShow: function() {
			console.log('App Show')
		},
		onHide: function() {
			console.log('App Hide')
		}
	}
</script>

<style>
	/* 每个页面公共css */
</style>