window.addEventListener('load', (event) => {
    // prepare variables
    const backendButton = document.getElementById('backend-button')
    const frontendButton = document.getElementById('frontend-button')
    const cmsButton = document.getElementById('cms-button')
    const mpButton = document.getElementById('mp-button')
    const databaseButton = document.getElementById('database-button')
    const pmButton = document.getElementById('pm-button')
    const toolsButton = document.getElementById('tools-button')
    const osButton = document.getElementById('os-button')
    const serverButton = document.getElementById('server-button')

    const backendDialog = document.getElementById('backend-dialog')
    const frontendDialog = document.getElementById('frontend-dialog')
    const cmsDialog = document.getElementById('cms-dialog')
    const mpDialog = document.getElementById('mp-dialog')
    const databaseDialog = document.getElementById('database-dialog')
    const pmDialog = document.getElementById('pm-dialog')
    const toolsDialog = document.getElementById('tools-dialog')
    const osDialog = document.getElementById('os-dialog')
    const serverDialog = document.getElementById('server-dialog')

    // events
    backendButton.addEventListener('click', function() {
        backendDialog.showModal()
    })

    frontendButton.addEventListener('click', function() {
        frontendDialog.showModal()
    })

    cmsButton.addEventListener('click', function() {
        cmsDialog.showModal()
    })

    mpButton.addEventListener('click', function() {
        mpDialog.showModal()
    })

    databaseButton.addEventListener('click', function() {
        databaseDialog.showModal()
    })

    pmButton.addEventListener('click', function() {
        pmDialog.showModal()
    })

    toolsButton.addEventListener('click', function() {
        toolsDialog.showModal()
    })

    osButton.addEventListener('click', function() {
        osDialog.showModal()
    })

    serverButton.addEventListener('click', function() {
        serverDialog.showModal()
    })
})